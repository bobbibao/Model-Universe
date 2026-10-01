import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import { select } from './support/agentApi';
import ConversionService, { type Purchase } from '../../src/core/server/services/marketing/ConversionService';
import OrderService from '../../src/core/server/services/OrderService';

// Server-side purchase events (CONVERSIONS_MODE=fake records the payloads): one per platform whose tag is configured,
// `event_id` = the order id (shared with the browser event), customer identifiers only with marketing consent.
describe('conversion events', () => {
  let sequelize: Sequelize;
  const TAGS = {
    NEXT_PUBLIC_META_PIXEL_ID: '1234567890',
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: 'CTIKTOK123',
    NEXT_PUBLIC_GOOGLE_TAG_ID: 'AW-123456',
    NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL: 'abcDEF',
  };
  const setTags = (on: boolean) => {
    for (const [name, value] of Object.entries(TAGS)) {
      if (on) process.env[name] = value;
      else delete process.env[name];
    }
  };
  const purchase = (orderId: number, extra: Partial<Purchase['order']> = {}, consent = false): Purchase => ({
    order: {
      id: orderId,
      total: 1500000,
      phone: '0912345678',
      createdAt: new Date('2026-10-01T03:00:00Z'),
      clickId: null,
      clickIdType: null,
      ...extra,
    },
    email: 'Khach.Hang@Example.vn',
    lines: [{ sku: 'SKU-1', quantity: 2, unitPriceVnd: 750000 }],
    consent: { analytics: consent, marketing: consent },
  });
  const events = (orderId: number) =>
    select<{ platform: string; status: string; eventId: string; payload: Record<string, unknown> }>(
      sequelize,
      'SELECT platform, status, "eventId", payload FROM conversion_event WHERE "orderId" = :orderId ORDER BY platform',
      { orderId },
    );

  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    process.env.CONVERSIONS_MODE = 'fake';
  }, 600_000);
  afterAll(() => sequelize.close());

  it('sends nothing without a configured tag', async () => {
    setTags(false);
    await new ConversionService().recordPurchase(purchase(900001, { clickId: 'gclid-1', clickIdType: 'gclid' }, true));
    expect(await events(900001)).toEqual([]);
  });

  it('records one event per tagged platform, with the order id as event id, and identifiers only with consent', async () => {
    setTags(true);
    await new ConversionService().recordPurchase(purchase(900002, { clickId: 'IwAR-click', clickIdType: 'fbclid' }));
    const without = await events(900002);
    expect(without.map((e) => [e.platform, e.status])).toEqual([
      ['google', 'skipped'], // no gclid: nothing Google can match
      ['meta', 'fake'],
      ['tiktok', 'skipped'], // no ttclid and no consent: nothing TikTok can match
    ]);
    const meta = without.find((e) => e.platform === 'meta')!;
    expect(meta.eventId).toBe('900002');
    const [event] = (meta.payload as { data: Record<string, any>[] }).data;
    expect(event).toMatchObject({ event_name: 'Purchase', event_id: '900002', action_source: 'website' });
    expect(event.custom_data).toEqual({
      currency: 'VND',
      value: 1500000,
      content_ids: ['SKU-1'],
      content_type: 'product',
      num_items: 2,
    });
    expect(Object.keys(event.user_data)).toEqual(['fbc']);
    expect(event.user_data.fbc).toMatch(/^fb\.1\.\d+\.IwAR-click$/);

    await new ConversionService().recordPurchase(purchase(900003, { clickId: 'gclid-9', clickIdType: 'gclid' }, true));
    const consented = await events(900003);
    expect(consented.map((e) => [e.platform, e.status])).toEqual([
      ['google', 'fake'],
      ['meta', 'fake'],
      ['tiktok', 'fake'],
    ]);
    const google = consented.find((e) => e.platform === 'google')!.payload;
    expect(google).toEqual({
      gclid: 'gclid-9',
      conversion_date_time: '2026-10-01 10:00:00+07:00',
      conversion_value: 1500000,
      currency_code: 'VND',
      order_id: '900003',
    });
    const metaUser = (consented.find((e) => e.platform === 'meta')!.payload as { data: Record<string, any>[] }).data[0]
      .user_data;
    expect(metaUser.em).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/)]);
    expect(metaUser.ph).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/)]);
    expect(JSON.stringify(consented)).not.toMatch(/Khach|0912345678/);
    const tiktok = consented.find((e) => e.platform === 'tiktok')!.payload as { data: Record<string, any>[] };
    expect(tiktok.data[0]).toMatchObject({ event: 'CompletePayment', event_id: '900003' });

    // Once per order and platform.
    await new ConversionService().recordPurchase(purchase(900003, { clickId: 'gclid-9', clickIdType: 'gclid' }, true));
    expect(await events(900003)).toHaveLength(3);
  });

  it('records the purchase when an order is placed', async () => {
    setTags(true);
    const [{ id: userId }] = await select<{ id: number }>(
      sequelize,
      `SELECT id FROM "user" WHERE role = 'USER' LIMIT 1`,
    );
    const [product] = await select<{ id: number; sizes: string[] }>(
      sequelize,
      `SELECT id, "availableSizes" AS sizes FROM product WHERE stock > 5 AND NOT "isArchived"
       AND "inventoryStatus" = 'available' ORDER BY id LIMIT 1`,
    );
    const order = await new OrderService().placeOrder(
      userId,
      {
        items: [{ productId: product.id, size: product.sizes[0] ?? '', quantity: 1 }],
        shipping: { recipientName: 'Khách Test', phone: '0912345678', address: '12 Đường B', city: 'Hà Nội' },
      },
      {
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: null,
        utmContent: null,
        utmTerm: null,
        clickId: 'gclid-x',
        clickIdType: 'gclid',
        landingPath: '/',
      },
      { analytics: true, marketing: true },
    );
    // The events are sent after the answer; wait for them.
    for (let attempt = 0; attempt < 50 && (await events(order.id)).length < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const recorded = await events(order.id);
    expect(recorded.map((e) => [e.platform, e.status, e.eventId])).toEqual([
      ['google', 'fake', String(order.id)],
      ['meta', 'fake', String(order.id)],
      ['tiktok', 'fake', String(order.id)],
    ]);
    setTags(false);
  });
});
