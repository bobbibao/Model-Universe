import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import { parseAttributionCookie } from '../../src/shared/server/utils/AttributionUtils';

// OrderService.placeOrder stores the storefront's attribution cookie on the order (analytics.orders_attributed).
describe('order attribution', () => {
  let sequelize: Sequelize;
  let userId: number;
  let productId: number;
  let size: string;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    [{ id: userId }] = await sequelize.query<{ id: number }>("SELECT id FROM \"user\" WHERE role = 'USER' LIMIT 1", {
      type: QueryTypes.SELECT,
    });
    const [product] = await sequelize.query<{ id: number; sizes: string[] }>(
      `SELECT id, "availableSizes" AS sizes FROM product WHERE stock > 5 AND NOT "isArchived"
       AND "inventoryStatus" = 'available' ORDER BY id LIMIT 1`,
      { type: QueryTypes.SELECT },
    );
    productId = product.id;
    size = product.sizes[0] ?? '';
  }, 600_000);
  afterAll(() => sequelize.close());

  const place = (attribution: ReturnType<typeof parseAttributionCookie>) =>
    new OrderService().placeOrder(
      userId,
      {
        items: [{ productId, size, quantity: 1 }],
        shipping: { recipientName: 'Khách Test', phone: '0912345678', address: '12 Đường B', city: 'Hà Nội' },
      },
      attribution,
    );

  it('keeps the last click on the order and in the agent view', async () => {
    const cookie = JSON.stringify({
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      utmCampaign: 'ag-12345678-opt1',
      clickId: 'IwAR0abc',
      clickIdType: 'fbclid',
      landingPath: '/shop',
    });
    const order = await place(parseAttributionCookie(cookie));
    const [row] = await sequelize.query<Record<string, string | null>>(
      `SELECT utm_source, utm_medium, campaign_ref, click_id_type, landing_path FROM analytics.orders_attributed
       WHERE order_id = :id`,
      { replacements: { id: order!.id }, type: QueryTypes.SELECT },
    );
    expect(row).toEqual({
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      campaign_ref: 'ag-12345678-opt1',
      click_id_type: 'fbclid',
      landing_path: '/shop',
    });
  });

  it('leaves a direct order unattributed', async () => {
    const order = await place(null);
    const [row] = await sequelize.query<{ utmSource: string | null; clickId: string | null }>(
      'SELECT "utmSource", "clickId" FROM "order" WHERE id = :id',
      { replacements: { id: order!.id }, type: QueryTypes.SELECT },
    );
    expect(row).toEqual({ utmSource: null, clickId: null });
  });
});
