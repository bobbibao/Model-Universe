import crypto from 'crypto';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import CartService from '../../src/core/server/services/CartService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import PricingApprovalService from '../../src/core/server/services/PricingApprovalService';
import PromotionReconciliationService, {
  previousVietnamDay,
} from '../../src/core/server/services/PromotionReconciliationService';
import FulfillmentService from '../../src/core/server/services/FulfillmentService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import NotificationDispatchService from '../../src/core/server/services/NotificationDispatchService';
import { QUOTE_TTL_MS, signQuote } from '../../src/core/server/services/CheckoutQuote';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import ProductCostProfileModel from '../../src/core/server/database/client/models/ProductCostProfile.Model';
import ProductPriceApprovalModel from '../../src/core/server/database/client/models/ProductPriceApproval.Model';
import PromotionReconciliationModel from '../../src/core/server/database/client/models/PromotionReconciliation.Model';
import AdminAlertModel from '../../src/core/server/database/client/models/AdminAlert.Model';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import { listPriceForMemberPrice } from '../../src/shared/pricing';
import { DEFAULT_VOUCHER_POLICY } from '../../src/shared/voucher-stack';

const shipping = { recipientName: 'Fixture Collector', phone: '0901234567', address: '12 Fixture Road', city: 'Fixture City' };
const DAY = 86_400_000;

// The data and policy behind the v6.2 profit guard: approved list prices and cost profiles (two admins), the voucher
// policy (stricter only), signed checkout quotes, and the nightly promotion reconciliation.
describe('pricing guard: approved prices and costs, voucher policy, signed quotes, reconciliation', () => {
  let db: Sequelize, product: ProductModel, other: ProductModel, userId: number, adminId: number, secondAdminId: number;
  const approvals = new PricingApprovalService(),
    policies = new CommercePolicyService(),
    cart = new CartService(),
    orders = new OrderService();
  const items = (p = product) => [{ productId: p.id, quantity: 1, size: '' }];
  const quote = (code = 'KIT12P', p = product) => cart.quote(items(p), { couponCode: code, userId });
  const place = (extra: Record<string, unknown> = {}, p = product) =>
    orders.placeOrder(userId, {
      items: items(p),
      shipping,
      paymentPlan: 'full',
      requestKey: `guard-${crypto.randomUUID()}`,
      ...extra,
    });
  const approveVoucherPolicy = async (settings: Record<string, unknown>) => {
    const { version } = await policies.voucherPolicy();
    return policies.approve('voucher', { ...DEFAULT_VOUCHER_POLICY, ...settings }, version ?? 0, adminId, 'Test fixture');
  };

  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationDispatchService.prototype, 'dispatchSoon').mockReturnValue(undefined);
    jest.spyOn(FulfillmentService.prototype, 'autoCreateShipment').mockResolvedValue(null);
    db = await seedTestDatabase();
    [product, other] = await ProductModel.findAll({
      where: { condition: 'new', isArchived: false, partnerId: null },
      order: [['id', 'ASC']],
      limit: 2,
    });
    // R 1,111,111 (member price 1,000,000), cost 800,000: the v6.2 TC09 case; KIT12 keeps 87.73% of L10.
    for (const p of [product, other]) {
      await p.update({ price: listPriceForMemberPrice(1_000_000), importPrice: 800_000, stock: 50, inventoryStatus: 'available' });
      await ProductDiscountModel.destroy({ where: { productId: p.id } });
    }
    userId = (await UserModel.findOne({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']] }))!.id;
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
    secondAdminId = (
      await UserModel.create({
        email: `second-admin-${Date.now()}@example.test`,
        passwordHash: 'x',
        firstName: 'Second',
        lastName: 'Admin',
        role: 'ADMIN',
        isActive: true,
      })
    ).id;
    await CouponModel.create({
      code: 'KIT12P',
      title: 'KIT12P',
      discountPercent: 12,
      maxDiscountVnd: 500_000,
      profitGuard: true,
      usageCount: 0,
      isActive: true,
      minOrderVnd: 0,
      startDate: new Date(Date.now() - DAY),
      expirationDate: new Date(Date.now() + 30 * DAY),
      source: 'admin',
    });
  }, 600_000);
  afterAll(() => db.close());

  it('uses an approved cost profile, approved by a second admin and replaced only by a newer approval', async () => {
    expect(await quote()).toMatchObject({ voucherDiscountVnd: 133_333, voucherStatus: 'VOUCHER_ONLY_VALID' });
    // Repair of 100,000 makes C 900,000: KIT12 would keep 70.69% of the standard profit.
    const draft = await approvals.proposeCost(adminId, { productId: product.id, buyInVnd: 800_000, repairVnd: 100_000, reason: 'Repaint' });
    expect((await quote()).voucherStatus).toBe('VOUCHER_ONLY_VALID'); // a draft changes nothing
    await expect(approvals.approve('cost', draft.id, adminId)).rejects.toMatchObject({ code: 'SEPARATE_APPROVER' });
    await approvals.approve('cost', draft.id, secondAdminId);
    const refused = await quote();
    expect(refused).toMatchObject({ discount: 0, couponCode: null, voucherStatus: 'VOUCHER_INVALID' });
    await expect(place({ couponCode: 'KIT12P' })).rejects.toMatchObject({ code: 'VOUCHER_NOT_ELIGIBLE' });
    // A newer receipt price above the profile's buy-in counts instead (the higher of the two).
    expect((await approvals.effective([{ ...product.get({ plain: true }), importPrice: 850_000 }], { pricingApproval: 'recorded' })).get(product.id)).toEqual({
      costVnd: 950_000,
      priceApproved: true,
    });
    await expect(approvals.retire('cost', draft.id, secondAdminId)).rejects.toMatchObject({ code: 'APPROVED_RECORD' });
    const lower = await approvals.proposeCost(secondAdminId, { productId: product.id, buyInVnd: 800_000, reason: 'Repair refunded' });
    await approvals.approve('cost', lower.id, adminId);
    expect((await ProductCostProfileModel.findByPk(draft.id))!.status).toBe('RETIRED');
    expect((await quote()).voucherStatus).toBe('VOUCHER_ONLY_VALID');
  });

  it('blocks codes when the price differs from its approved R, and under "required" without an approved R', async () => {
    await expect(
      approvals.proposePrice(adminId, { productId: product.id, listPriceVnd: product.price + 1, proof: 'Shop page', reason: 'R' }),
    ).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    const record = await approvals.proposePrice(adminId, { productId: product.id, listPriceVnd: product.price, proof: 'Shop page', reason: 'R' });
    await approvals.approve('price', record.id, secondAdminId);
    expect((await quote()).voucherStatus).toBe('VOUCHER_ONLY_VALID');
    const price = product.price;
    await product.update({ price: price + 1_000 });
    try {
      expect(await quote()).toMatchObject({ voucherStatus: 'VOUCHER_INVALID', discount: 0 });
      const listed = await approvals.list({ filter: 'mismatch' });
      expect(listed.rows.map((row) => row.id)).toEqual([product.id]);
      expect(listed.summary).toMatchObject({ mismatch: 1, approved: 1, pending: 0 });
    } finally {
      await product.update({ price });
    }
    // Under 'required', the second product (no approved R) takes no code; this one still does.
    const strict = await approveVoucherPolicy({ pricingApproval: 'required' });
    try {
      expect((await quote('KIT12P', other)).voucherStatus).toBe('VOUCHER_INVALID');
      expect((await quote()).voucherStatus).toBe('VOUCHER_ONLY_VALID');
      // The order records the policy it was checked with.
      const order = await place({ couponCode: 'KIT12P' });
      expect(order.benefitSnapshot).toMatchObject({ policyVersion: strict.version });
      await orders.cancelForUser(userId, order.id, { reason: 'changed_mind' });
    } finally {
      await approveVoucherPolicy({});
    }
    expect((await ProductPriceApprovalModel.findByPk(record.id))!.status).toBe('APPROVED');
  });

  it('applies a stricter voucher policy and refuses a looser one', async () => {
    await expect(approveVoucherPolicy({ keepPlainBps: 7_000 })).rejects.toMatchObject({ statusCode: 400 });
    await approveVoucherPolicy({ keepPlainBps: 9_000, keepStackBps: 8_500 });
    try {
      expect(await quote()).toMatchObject({ voucherStatus: 'VOUCHER_INVALID', discount: 0 });
    } finally {
      await approveVoucherPolicy({});
    }
    expect((await quote()).voucherStatus).toBe('VOUCHER_ONLY_VALID');
  });

  it('places an order on its signed quote and refuses a forged, expired or outdated one', async () => {
    // The second product has no approved R, so a price change reaches the quote check instead of the guard.
    const quoted = await quote('KIT12P', other);
    expect(quoted.quote?.id).toEqual(expect.any(String));
    await expect(place({ couponCode: 'KIT12P', quoteId: `${quoted.quote!.id}x` }, other)).rejects.toMatchObject({ code: 'QUOTE_INVALID' });
    const stale = signQuote(
      { userId, items: [], couponCode: null, freeshipCode: null, voucherDiscountVnd: 0, rankDiscountVnd: 0, ruleVersion: 'v6.2', policyVersion: null },
      Date.now() - QUOTE_TTL_MS - 1,
    );
    await expect(place({ couponCode: 'KIT12P', quoteId: stale.id }, other)).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
    // Without the code the benefits differ from the quote.
    await expect(place({ quoteId: quoted.quote!.id }, other)).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    const price = other.price;
    await other.update({ price: price + 1_000 });
    try {
      await expect(place({ couponCode: 'KIT12P', quoteId: quoted.quote!.id }, other)).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    } finally {
      await other.update({ price });
    }
    const order = await place({ couponCode: 'KIT12P', quoteId: quoted.quote!.id, expectedTotal: quoted.total }, other);
    expect(order.discount).toBe(133_333);
    await orders.cancelForUser(userId, order.id, { reason: 'changed_mind' });
  });

  it('reconciles the previous Vietnam day once and alerts staff about its problems', async () => {
    const now = new Date();
    const { day, start } = previousVietnamDay(now);
    expect(start.getTime()).toBeLessThan(now.getTime());
    const order = await place();
    await OrderModel.update(
      {
        benefitSnapshot: {
          kind: 'v6.2',
          status: 'VOUCHER_ONLY_VALID',
          voucher: { discountVnd: 400_000 },
          internal: { standardProfitVnd: 100_000, plainProfitVnd: -5_000, stackProfitVnd: null },
        },
        createdAt: new Date(start.getTime() + 3_600_000),
      },
      { where: { id: order.id }, silent: true },
    );
    const reconciliation = new PromotionReconciliationService();
    const [first, second] = await Promise.all([reconciliation.run(now), reconciliation.run(now)]);
    const row = (await PromotionReconciliationModel.findOne({ where: { day } }))!;
    expect([first?.id, second?.id].filter(Boolean)).toContain(row.id);
    expect(row.report).toMatchObject({
      orders: { withBenefits: 1, voucherDiscountVnd: 400_000 },
      problems: { negativeProfitOrderIds: [order.id] },
    });
    expect(row.problemCount).toBe(1);
    expect(await AdminAlertModel.count({ where: { dedupeKey: `promotion-reconciliation:${day}` } })).toBe(1);
    expect(await reconciliation.run(now)).toBeNull();
    expect(await PromotionReconciliationModel.count({ where: { day } })).toBe(1);
  });
});
