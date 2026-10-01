import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import { callApproved, establishedProducts, select, setAgentSetting, useApprovalSecret } from './support/agentApi';
import OrderService from '../../src/core/server/services/OrderService';
import { couponDiscount } from '../../src/core/server/services/CouponService';

// Decree 81/2018 as amended by 128/2024: a price reduction takes at most 50% off the list price, counting a product
// discount and a coupon together. The Agent API refuses a combination above it (422 legal_max); checkout clamps an
// agent coupon so that no line goes below half its list price, whatever got into the database.
describe('legal maximum on stacked promotions', () => {
  let sequelize: Sequelize;
  let app: Express;
  let product: { id: number; sku: string; price: number; cost: number };
  beforeAll(async () => {
    useApprovalSecret();
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    // Seeded products cost 60% of their price; a 10% floor lets a 30% discount through.
    await setAgentSetting(sequelize, 'growth.goal', {
      margin_floor_pct: 10,
      revenue_target_vnd: 'auto',
      max_spend_ratio_pct: 8,
    });
    [product] = await select(
      sequelize,
      `SELECT id, sku, price, "importPrice" AS cost FROM product
       WHERE NOT "isArchived" AND "inventoryStatus" = 'available' AND stock > 5
         AND "createdAt" < NOW() - INTERVAL '31 days' ORDER BY id LIMIT 1`,
    );
  }, 600_000);
  afterAll(() => sequelize.close());

  it('refuses a 30% coupon on top of a running 30% discount (51% off)', async () => {
    const discount = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'l:disc',
      body: { skus: [product.sku], percent: 30, duration_days: 5 },
    });
    expect(discount.status).toBe(200);
    const coupon = await callApproved(app, {
      path: 'promotions/coupons',
      key: 'l:coupon',
      body: { code: 'AI-STACK30', title: 'Giảm 30%', percent: 30, duration_days: 5 },
    });
    expect(coupon.status).toBe(422);
    expect(coupon.body).toMatchObject({ code: 'limit_exceeded', reason: 'legal_max' });
    // 20% is 44% off together: allowed by the law (the margin floor is checked next).
    const smaller = await callApproved(app, {
      path: 'promotions/coupons',
      key: 'l:coupon:20',
      body: { code: 'AI-STACK20', title: 'Giảm 20%', percent: 20, duration_days: 5 },
    });
    expect(smaller.body.reason).not.toBe('legal_max');
  });

  it('clamps an agent coupon at checkout so a line keeps half its list price', async () => {
    // An agent coupon that got past the API (written directly): 30% on top of the running 30% discount.
    await sequelize.query(
      `INSERT INTO coupon (code, title, "discountPercent", "usageCount", "startDate", "expirationDate", "isActive",
                           "minOrderVnd", source, "createdAt", "updatedAt")
       VALUES ('AI-RAW30', 'Giảm 30%', 30, 0, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days', true, 0, 'agent',
               NOW(), NOW())`,
    );
    const [{ id: userId }] = await select<{ id: number }>(
      sequelize,
      `SELECT id FROM "user" WHERE role = 'USER' LIMIT 1`,
    );
    const [{ sizes }] = await select<{ sizes: string[] }>(
      sequelize,
      'SELECT "availableSizes" AS sizes FROM product WHERE id = :id',
      { id: product.id },
    );
    const order = await new OrderService().placeOrder(userId, {
      items: [{ productId: product.id, size: sizes[0] ?? '', quantity: 2 }],
      shipping: { recipientName: 'Khách Test', phone: '0912345678', address: '12 Đường B', city: 'Hà Nội' },
      couponCode: 'AI-RAW30',
    });
    const sale = Math.round(product.price * 0.7);
    // Half the list price is the floor: the coupon may take only (50% - 30%) of the list price per unit.
    expect(order.subtotal).toBe(sale * 2);
    expect(order.discount).toBe(Math.floor((product.price * 0.5 - (product.price - sale)) * 2));
    expect(order.total).toBeGreaterThanOrEqual(product.price);

    // An admin coupon is not clamped (admins answer for their own promotions).
    expect(
      couponDiscount({ discountPercent: 30, source: 'admin' }, [{ listPrice: 1000, salePrice: 700, quantity: 1 }]),
    ).toBe(210);
    expect(
      couponDiscount({ discountPercent: 30, source: 'agent' }, [{ listPrice: 1000, salePrice: 700, quantity: 1 }]),
    ).toBe(200);
    expect(
      couponDiscount({ discountPercent: 10, source: 'agent' }, [{ listPrice: 1000, salePrice: 1000, quantity: 3 }]),
    ).toBe(300);
  });
});
