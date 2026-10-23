import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import PromotionService from '../../src/core/server/services/PromotionService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import VoucherService from '../../src/core/server/services/VoucherService';
import CartService from '../../src/core/server/services/CartService';
import FulfillmentService from '../../src/core/server/services/FulfillmentService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import NotificationDispatchService from '../../src/core/server/services/NotificationDispatchService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import LoyaltyLedgerModel from '../../src/core/server/database/client/models/LoyaltyLedger.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import { listPriceForMemberPrice } from '../../src/shared/pricing';

const shipping = {
  recipientName: 'Fixture Collector',
  phone: '0901234567',
  address: '12 Fixture Road',
  city: 'Fixture City',
};
const DAY = 86_400_000;

// Checkout benefits under the rules v6.2 and the ways customers earn codes and points (src/shared/promotions.ts).
describe('promotions: one voucher plus the rank benefit, drops, check-in, wheel and missions', () => {
  let db: Sequelize, product: ProductModel, userId: number, otherId: number, adminId: number;
  const orders = new OrderService(),
    promotions = new PromotionService();
  const coupon = (code: string, values: Record<string, unknown>) =>
    CouponModel.create({
      code,
      title: code,
      discountPercent: 0,
      usageCount: 0,
      isActive: true,
      minOrderVnd: 0,
      startDate: new Date(Date.now() - DAY),
      expirationDate: new Date(Date.now() + 30 * DAY),
      source: 'admin',
      ...values,
    });
  const place = (extra: Record<string, unknown>) =>
    orders.placeOrder(userId, {
      items: [{ productId: product.id, quantity: 1, size: '' }],
      shipping,
      paymentPlan: 'full',
      requestKey: `promo-${crypto.randomUUID()}`,
      ...extra,
    });

  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationDispatchService.prototype, 'dispatchSoon').mockReturnValue(undefined);
    jest.spyOn(FulfillmentService.prototype, 'autoCreateShipment').mockResolvedValue(null);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({
      where: { condition: 'new', isArchived: false, partnerId: null },
      order: [['id', 'ASC']],
    }))!;
    // Member price 1,000,000, cost 800,000 (the v6.2 TC09 case): standard profit 172,000 after the point reserve.
    await product.update({
      price: listPriceForMemberPrice(1_000_000),
      importPrice: 800_000,
      stock: 50,
      inventoryStatus: 'available',
    });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    [userId, otherId] = (
      await UserModel.findAll({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']], limit: 2 })
    ).map((user) => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
    await new CommercePolicyService().approve(
      'loyalty',
      {
        rewardTable: 'source_shared_v1',
        stacking: 'v6.2',
        refundRounding: 'cumulative_net',
        lifetimeRefund: 'reverse_earned',
        voucherExpiryDays: 30,
      },
      0,
      adminId,
      'Test-only policy fixture; not a live business decision',
    );
  }, 600_000);
  afterAll(() => db.close());

  it('refuses a money-off code that would sell below the profit floor (no more unguarded admin codes)', async () => {
    await coupon('LOSS50', { discountPercent: 50 });
    await expect(place({ couponCode: 'LOSS50' })).rejects.toMatchObject({ code: 'VOUCHER_NOT_ELIGIBLE' });
    const quote = await new CartService().quote([{ productId: product.id, quantity: 1, size: '' }], {
      couponCode: 'LOSS50',
      userId,
    });
    expect(quote).toMatchObject({ discount: 0, couponCode: null });
    expect(quote.voucherRefusal).toMatch(/không áp dụng được/);
    // Customers see the reason, never the shop's profit figures.
    expect(JSON.stringify(quote)).not.toMatch(/ProfitVnd/);
  });

  it('adds the Diamond rank benefit to the member code, never spends points as money, and releases on cancel', async () => {
    await coupon('MEMBER10X', { discountPercent: 10, profitGuard: true });
    await coupon('SHIP30', { benefitType: 'freeship', maxShippingVnd: 30_000, minOrderVnd: 500_000 });
    // 10,000 lifetime points: Diamond (+2%, up to 100,000); 100 of them still spendable.
    await LoyaltyLedgerModel.create({
      userId,
      actorUserId: adminId,
      sourceReference: `fixture-points:${userId}`,
      kind: 'earn',
      balanceDelta: 100,
      lifetimeDelta: 10_000,
      usedDelta: 0,
      policyVersion: 1,
      reason: 'Fixture points',
      details: {},
    });
    // In-person orders have no shipping fee: the free-shipping code is refused there.
    await expect(place({ couponCode: 'MEMBER10X', freeshipCode: 'SHIP30' })).rejects.toMatchObject({
      code: 'FREESHIP_NOT_ELIGIBLE',
    });
    // Points buy point vouchers; they are not money at checkout.
    await expect(place({ couponCode: 'MEMBER10X', redeemPoints: 20 })).rejects.toMatchObject({ code: 'POINTS_NOT_CASH' });
    const quote = await new CartService().quote([{ productId: product.id, quantity: 1, size: '' }], {
      couponCode: 'MEMBER10X',
      userId,
    });
    expect(quote).toMatchObject({
      voucherDiscountVnd: 111_111,
      voucherStatus: 'STACK_VALID',
      rank: { code: 'MU-RANK06', tier: 'DIAMOND' },
      rankDiscountVnd: 22_222,
      discount: 133_333,
      earnedPoints: 24,
    });
    const order = await place({ couponCode: 'MEMBER10X' });
    expect(order.pointsUsed).toBe(0);
    // 10% and 2% both on the list price R = 1,111,111: 111,111 + 22,222.
    expect(order.discount).toBe(133_333);
    expect(order.total).toBe(product.price - 133_333);
    expect(order.benefitSnapshot).toMatchObject({
      ruleVersion: 'v6.2',
      status: 'STACK_VALID',
      rank: { code: 'MU-RANK06', discountVnd: 22_222 },
    });
    // The customer's copy of the order has no profit figures (BR-016).
    expect((order.get({ plain: true }) as { benefitSnapshot: Record<string, unknown> }).benefitSnapshot).not.toHaveProperty(
      'internal',
    );
    expect((await promotions.hub(userId)).member?.points).toBe(100);
    // A slot holds only its kind of code.
    await expect(place({ couponCode: 'SHIP30' })).rejects.toMatchObject({ code: 'VOUCHER_SLOT' });
    await orders.cancelForUser(userId, order.id, { reason: 'changed_mind' });
    expect((await CouponModel.findOne({ where: { code: 'MEMBER10X' } }))!.usageCount).toBe(0);
  });

  it('refuses the rank benefit, keeping the voucher alone, when the pair keeps under 75% of the standard profit', async () => {
    await coupon('KIT12X', { discountPercent: 12, maxDiscountVnd: 500_000, profitGuard: true });
    // R 1,666,667 and cost 1,250,000 (TC08): 12% passes alone (84.55%), plus Diamond only 69.11%.
    await product.update({ price: 1_666_667, importPrice: 1_250_000 });
    try {
      const quote = await new CartService().quote([{ productId: product.id, quantity: 1, size: '' }], {
        couponCode: 'KIT12X',
        userId,
      });
      expect(quote).toMatchObject({
        voucherDiscountVnd: 200_000,
        voucherStatus: 'VOUCHER_ONLY_VALID',
        rankDiscountVnd: 0,
        discount: 200_000,
      });
      expect(quote.rankRefusal).toMatch(/Ưu đãi hạng không áp dụng/);
      const order = await place({ couponCode: 'KIT12X' });
      expect(order.discount).toBe(200_000);
    } finally {
      await product.update({ price: listPriceForMemberPrice(1_000_000), importPrice: 800_000 });
    }
  });

  it('lets a limited voucher drop be saved once per customer, and only saved codes be used', async () => {
    const drop = await coupon('DROP12H', {
      discountPercent: 5,
      profitGuard: true,
      requiresClaim: true,
      claimLimit: 1,
      minOrderVnd: 0,
    });
    await expect(place({ couponCode: 'DROP12H' })).rejects.toMatchObject({ code: 'VOUCHER_NOT_CLAIMED' });
    await promotions.claimVoucher(userId, drop.id);
    await expect(promotions.claimVoucher(userId, drop.id)).rejects.toMatchObject({ code: 'DROP_CLAIMED' });
    await expect(promotions.claimVoucher(otherId, drop.id)).rejects.toMatchObject({ code: 'DROP_SOLD_OUT' });
    expect((await new VoucherService().wallet(userId)).vouchers.map((voucher) => voucher.code)).toContain('DROP12H');
    expect((await new VoucherService().wallet(otherId)).vouchers.map((voucher) => voucher.code)).not.toContain(
      'DROP12H',
    );
    const order = await place({ couponCode: 'DROP12H' });
    expect(order.discount).toBeGreaterThan(0);
    const hub = await promotions.hub(userId);
    expect(hub.drops.find((row) => row.id === drop.id)).toMatchObject({ claimed: true, remaining: 0, code: 'DROP12H' });
  });

  it('pays the daily check-in and the wheel once a day, and each mission once', async () => {
    const first = await promotions.checkin(otherId);
    expect(first).toMatchObject({ day: 1, points: 1 });
    await expect(promotions.checkin(otherId)).rejects.toMatchObject({ code: 'CHECKIN_DONE' });
    const prize = await promotions.spin(otherId);
    expect(prize.label).toBeTruthy();
    if (prize.couponCode)
      expect(await CouponModel.findOne({ where: { code: prize.couponCode, ownerUserId: otherId } })).not.toBeNull();
    await expect(promotions.spin(otherId)).rejects.toMatchObject({ code: 'WHEEL_DONE' });
    expect(await promotions.claimMission(otherId, 'share')).toMatchObject({ points: 5 });
    await expect(promotions.claimMission(otherId, 'share')).rejects.toMatchObject({ code: 'MISSION_DONE' });
    // A mission the customer has not done yet pays nothing.
    const fresh = await UserModel.create({
      email: `fresh-${Date.now()}@example.test`,
      passwordHash: 'x',
      firstName: 'Fresh',
      lastName: 'Collector',
      role: 'USER',
      isActive: true,
    });
    await expect(promotions.claimMission(fresh.id, 'first_order')).rejects.toMatchObject({
      code: 'MISSION_INCOMPLETE',
    });
    await expect(promotions.claimMission(adminId, 'share')).rejects.toMatchObject({ statusCode: 403 });
    const hub = await promotions.hub(otherId);
    expect(hub.checkin).toMatchObject({ doneToday: true, streak: 1 });
    expect(hub.wheel.spunToday).toBe(true);
    expect(hub.missions.find((mission) => mission.key === 'share')).toMatchObject({ claimed: true });
  });

  it('shows the tier rank benefit instead of monthly free-shipping perks', async () => {
    await LoyaltyLedgerModel.create({
      userId: otherId,
      actorUserId: adminId,
      sourceReference: `fixture-gold:${otherId}`,
      kind: 'earn',
      balanceDelta: 0,
      lifetimeDelta: 500,
      usedDelta: 0,
      policyVersion: 1,
      reason: 'Fixture tier',
      details: {},
    });
    // GOLD: +1%, up to 40,000, on top of one main voucher.
    expect((await promotions.hub(otherId)).member?.rank).toMatchObject({ code: 'MU-RANK03', bps: 100, capVnd: 40_000 });
    expect(await CouponModel.count({ where: { ownerUserId: otherId, code: { [Op.like]: 'FS%' } } })).toBe(0);
  });
  it('keeps the advertised free-shipping codes and the member code template, without duplicating them', async () => {
    await promotions.ensureStandingOffers();
    await promotions.ensureStandingOffers();
    const ship = await CouponModel.findAll({ where: { code: ['FREESHIP30', 'FREESHIP50'] }, order: [['code', 'ASC']] });
    expect(
      ship.map((row) => [row.benefitType, row.maxShippingVnd, row.minOrderVnd, row.isPublic, row.profitGuard]),
    ).toEqual([
      ['freeship', 30_000, 500_000, true, true],
      ['freeship', 50_000, 2_000_000, true, true],
    ]);
    const template = (await CouponModel.findAll({ where: { code: 'MEMBER-MONTHLY' } }))!;
    expect(template).toHaveLength(1);
    expect(template[0]).toMatchObject({ kind: 'member_template', discountPercent: 10, profitGuard: true });
    // Shown on the offers page as codes to copy, never as drops to save.
    const hub = await promotions.hub(userId);
    expect(hub.standing.map((row) => row.code)).toEqual(expect.arrayContaining(['FREESHIP30', 'FREESHIP50']));
    expect(hub.drops.some((row) => row.code === 'FREESHIP30')).toBe(false);
  });
});
