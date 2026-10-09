import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import { callAgent, callApproved, establishedProducts, select, useApprovalSecret } from './support/agentApi';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';

// Promotions through the Agent API (packages/contracts/openapi/web-agent-api.yaml): discounts on SKUs, agent
// coupons, ending a campaign's promotions (protective), and reverting each.
describe('Agent API: promotions', () => {
  let sequelize: Sequelize;
  let app: Express;
  let skus: string[];
  beforeAll(async () => {
    useApprovalSecret();
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    skus = (await establishedProducts(sequelize, 10)).map((p) => p.sku);
    // Boundary fixtures must not depend on a small catalog's deterministic SKU hash producing a new arrival.
    const source = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false } }))!;
    await ProductModel.create({ name: 'Synthetic recently received Gunpla test fixture', sku: 'PROMOTION-NEW-ARRIVAL', brandName: source.brandName,
      categoryId: source.categoryId, imageUrl: source.imageUrl, price: 200000, importPrice: 120000, stock: 10, sold: 0, condition: 'new', availableSizes: [], createdAt: new Date() });
  }, 600_000);
  afterAll(() => sequelize.close());

  const discounts = (sku: string) =>
    select<{ percent: number; revoked: boolean; campaignRef: string | null }>(
      sequelize,
      `SELECT d.percent, d."revokedAt" IS NOT NULL AS revoked, d."campaignRef"
       FROM product_discount d JOIN product p ON p.id = d."productId" WHERE p.sku = :sku ORDER BY d.id`,
      { sku },
    );

  it('discounts SKUs for the campaign, refuses an overlap, and replaces only with replace_existing', async () => {
    const campaign = await callApproved(app, {
      path: 'marketing/campaigns',
      key: 'p:campaign:1',
      body: {
        ref: 'ag-abcdef12-opt1',
        name: 'Giảm giá',
        objective: 'sales',
        channels: ['promotion'],
        duration_days: 7,
      },
    });
    expect(campaign.status).toBe(200);
    const body = { skus: [skus[0], skus[1]], percent: 10, duration_days: 5, campaign_ref: 'ag-abcdef12-opt1' };
    const first = await callApproved(app, { path: 'pricing/discounts', key: 'p:disc:1', body });
    expect(first.status).toBe(200);
    expect(await discounts(skus[0])).toEqual([{ percent: 10, revoked: false, campaignRef: 'ag-abcdef12-opt1' }]);

    const overlap = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'p:disc:2',
      body: { skus: [skus[0]], percent: 12, duration_days: 3 },
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body).toMatchObject({ code: 'overlap', reason: 'discount_overlap' });

    const replace = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'p:disc:3',
      body: { skus: [skus[0]], percent: 12, duration_days: 3, replace_existing: true },
    });
    expect(replace.status).toBe(200);
    expect(replace.body.detail).toMatch(/ended 2 earlier agent discount/);
    expect((await discounts(skus[0])).map((d) => [d.percent, d.revoked])).toEqual([
      [10, true],
      [12, false],
    ]);

    // Reverting the replacement ends it and the discounts it replaced run again.
    const revert = await callAgent(app, { path: 'actions/p:disc:3/revert', key: 'p:disc:3:revert' });
    expect(revert.status).toBe(200);
    expect(revert.body.detail).toMatch(/1 discount\(s\) ended; 2 replaced discount\(s\) resumed/);
    expect((await discounts(skus[0])).map((d) => [d.percent, d.revoked])).toEqual([
      [10, false],
      [12, true],
    ]);
  });

  it('refuses new arrivals, a repeat within 30 days, a margin below the floor and above the legal maximum', async () => {
    const [{ sku: fresh }] = await select<{ sku: string }>(
      sequelize,
      `SELECT sku FROM product WHERE NOT "isArchived" AND "createdAt" > NOW() - INTERVAL '30 days' LIMIT 1`,
    );
    const newArrival = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'p:new',
      body: { skus: [fresh], percent: 10, duration_days: 3 },
    });
    expect(newArrival.status).toBe(422);
    expect(newArrival.body).toMatchObject({ code: 'limit_exceeded', reason: 'new_arrival' });

    // skus[1] was discounted by the agent today: not again within 30 days (once that discount ended).
    const end = await callAgent(app, { path: 'promotions/ag-abcdef12-opt1/end', key: 'p:end:1' });
    expect(end.body.detail).toMatch(/ended 0 coupon\(s\) and 2 discount\(s\)/);
    const repeat = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'p:repeat',
      body: { skus: [skus[1]], percent: 10, duration_days: 3 },
    });
    expect(repeat.status).toBe(422);
    expect(repeat.body.reason).toBe('frequency');

    // Seeded products cost 60% of their price: 30% off leaves a 14.3% margin, under the 15% floor.
    const margin = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'p:margin',
      body: { skus: [skus[2]], percent: 30, duration_days: 3 },
    });
    expect(margin.status).toBe(422);
    expect(margin.body.reason).toBe('margin_floor');
    // 45% with the seeded 20% coupon (SALE20, usable) is 56% off the list price.
    const legal = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'p:legal',
      body: { skus: [skus[2]], percent: 45, duration_days: 3 },
    });
    expect(legal.status).toBe(422);
    expect(legal.body.reason).toBe('legal_max');
  });

  it('creates an agent coupon, ends it (protective, the admins are told) and refuses its code twice', async () => {
    const body = {
      code: 'AI-TEST01',
      title: 'Giảm 10% cho đơn từ 500.000đ',
      percent: 10,
      duration_days: 7,
      min_order_vnd: 500000,
      usage_limit: 100,
      campaign_ref: 'ag-abcdef12-opt2',
    };
    const created = await callApproved(app, { path: 'promotions/coupons', key: 'p:coupon', body });
    expect(created.status).toBe(200);
    const [coupon] = await select<Record<string, unknown>>(
      sequelize,
      `SELECT source, "minOrderVnd", "usageLimit", "isActive", "campaignRef", "agentActionId" IS NOT NULL AS linked
       FROM coupon WHERE code = 'AI-TEST01'`,
    );
    expect(coupon).toEqual({
      source: 'agent',
      minOrderVnd: 500000,
      usageLimit: 100,
      isActive: true,
      campaignRef: 'ag-abcdef12-opt2',
      linked: true,
    });

    const again = await callApproved(app, { path: 'promotions/coupons', key: 'p:coupon:2', body });
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe('ref_taken');

    // Protective: no grant needed.
    const ended = await callAgent(app, {
      path: 'promotions/AI-TEST01/end',
      key: 'p:end:2',
      body: { reason: 'ROAS thấp' },
    });
    expect(ended.status).toBe(200);
    expect(ended.body.detail).toMatch(/ended 1 coupon/);
    const [after] = await select<{ isActive: boolean }>(
      sequelize,
      `SELECT "isActive" FROM coupon WHERE code = 'AI-TEST01'`,
    );
    expect(after.isActive).toBe(false);
    const [audit] = await select<{ writeClass: string; approvalMode: string }>(
      sequelize,
      `SELECT "writeClass", "approvalMode" FROM agent_action WHERE "idempotencyKey" = 'p:end:2'`,
    );
    expect(audit).toEqual({ writeClass: 'protective', approvalMode: 'protective' });
    expect(
      await select(sequelize, `SELECT 1 FROM admin_notification WHERE "dedupeKey" = 'protective:p:end:2'`),
    ).toHaveLength(1);

    const unknown = await callAgent(app, { path: 'promotions/AI-NOPE99/end', key: 'p:end:3' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('not_found');
  });

  it('records a campaign, and reverting a coupon disables it', async () => {
    const campaign = await callApproved(app, {
      path: 'marketing/campaigns',
      key: 'p:campaign',
      body: {
        ref: 'ag-abcdef12-opt3',
        name: 'Xả hàng cuối mùa',
        objective: 'clearance',
        channels: ['promotion', 'facebook_post'],
        duration_days: 7,
        budget_vnd: 0,
      },
    });
    expect(campaign.status).toBe(200);
    const [row] = await select<{ kind: string; channels: string[]; status: string; utmCampaign: string }>(
      sequelize,
      `SELECT kind, channels, status, "utmCampaign" FROM marketing_campaign WHERE ref = 'ag-abcdef12-opt3'`,
    );
    expect(row).toEqual({
      kind: 'mixed',
      channels: ['promotion', 'facebook_post'],
      status: 'active',
      utmCampaign: 'ag-abcdef12-opt3',
    });

    const coupon = await callApproved(app, {
      path: 'promotions/coupons',
      key: 'p:coupon:3',
      body: { code: 'AI-TEST03', title: 'Giảm 5%', percent: 5, duration_days: 3, campaign_ref: 'ag-abcdef12-opt3' },
    });
    expect(coupon.status).toBe(200);
    const revert = await callAgent(app, { path: 'actions/p:coupon:3/revert', key: 'p:coupon:3:revert' });
    expect(revert.status).toBe(200);
    const [after] = await select<{ isActive: boolean }>(
      sequelize,
      `SELECT "isActive" FROM coupon WHERE code = 'AI-TEST03'`,
    );
    expect(after.isActive).toBe(false);
    const again = await callAgent(app, { path: 'actions/p:coupon:3/revert', key: 'p:coupon:3:revert:2' });
    expect(again.body.detail).toMatch(/already reverted/);
  });
});
