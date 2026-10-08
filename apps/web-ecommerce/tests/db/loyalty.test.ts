import type { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { seedTestDatabase } from './support/testDb';
import LoyaltyService from '../../src/core/server/services/LoyaltyService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import OrderService from '../../src/core/server/services/OrderService';
import CartService from '../../src/core/server/services/CartService';
import ReturnService from '../../src/core/server/services/ReturnService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import LoyaltyLedgerModel from '../../src/core/server/database/client/models/LoyaltyLedger.Model';
import LoyaltyRedemptionModel from '../../src/core/server/database/client/models/LoyaltyRedemption.Model';
import EvidenceModel from '../../src/core/server/database/client/models/Evidence.Model';
import OrderReceiptModel from '../../src/core/server/database/client/models/OrderReceipt.Model';

describe('member transactions on disposable PostgreSQL', () => {
  let db: Sequelize,
    product: ProductModel,
    userId: number,
    otherId: number,
    adminId: number,
    firstOrder: OrderModel,
    code: string;
  const loyalty = new LoyaltyService(),
    orders = new OrderService();
  const shipping = {
    recipientName: 'Fixture Collector',
    phone: '0901234567',
    address: '12 Fixture Street',
    city: 'Fixture City',
  };
  const checkout = (key: string, owner = userId, couponCode?: string) =>
    orders.placeOrder(owner, {
      items: [{ productId: product.id, size: '', quantity: 1 }],
      shipping,
      requestKey: key,
      couponCode,
    });
  const deliver = async (order: OrderModel) => {
    await orders.updateStatus(order.id, 'SHIPPED', adminId);
    const delivered = await orders.updateStatus(order.id, 'DELIVERED', adminId);
    expect(delivered.paymentStatus).toBe('PENDING');
    return orders.confirmCollection(order.id, adminId, {
      amountVnd: delivered.total - delivered.prepaidVnd,
      externalReference: `COD-FIXTURE-${order.id}`,
      reason: 'Confirmed fixture courier remittance',
      moneyVerified: true,
    });
  };
  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({ where: { stock: { [Op.gt]: 5 } } }))!;
    await product.update({ price: 4000000, grade: 'RG', stock: 40 });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    [userId, otherId] = (await UserModel.findAll({ where: { role: 'USER' }, order: [['id', 'ASC']], limit: 2 })).map(
      (user) => user.id,
    );
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 600000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close();
  });

  it('gates activation without replaying retained purchase history', async () => {
    await expect(
      loyalty.redeem(userId, { rewardKey: 'fixed-60', requestKey: 'reward-before-policy' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await deliver(await checkout('purchase-before-policy'));
    expect((await loyalty.balances(userId)).available).toBe(0);
    await new CommercePolicyService().approve(
      'loyalty',
      {
        rewardTable: 'source_shared_v1',
        stacking: 'one_primary',
        refundRounding: 'cumulative_net',
        lifetimeRefund: 'reverse_earned',
        voucherExpiryDays: 30,
      },
      0,
      adminId,
      'Test-only policy fixture; not a live business decision',
    );
    expect((await loyalty.balances(userId)).available).toBe(0);
  });
  it('awards only a paid delivered undisputed purchase and deduplicates completion replay', async () => {
    firstOrder = await checkout('eligible-purchase-one');
    expect((await loyalty.balances(userId)).available).toBe(0);
    firstOrder = await deliver(firstOrder);
    expect((await loyalty.balances(userId)).available).toBe(100);
    await db.transaction((transaction) => loyalty.reconcileOrder(firstOrder, adminId, transaction));
    expect(await LoyaltyLedgerModel.count({ where: { sourceReference: `order:${firstOrder.id}` } })).toBe(1);
    const disputed = await checkout('disputed-purchase-one', otherId);
    await disputed.update({ status: 'DELIVERED', paymentStatus: 'PAID', deliveredAt: new Date() });
    const detail = await orders.getForUser(otherId, disputed.id);
    const item = detail.get('items') as { id: number }[];
    await new ReturnService().create(otherId, {
      orderId: disputed.id,
      items: [{ orderItemId: item[0].id, quantity: 1, reason: 'defective' }],
    });
    await db.transaction((transaction) => loyalty.reconcileOrder(disputed, adminId, transaction));
    expect((await loyalty.balances(otherId)).available).toBe(0);
  });
  it('serializes redemption, preserves tier points and isolates owned vouchers', async () => {
    const results = await Promise.allSettled(
      ['reward-first-unique', 'reward-second-unique'].map((requestKey) =>
        loyalty.redeem(userId, { rewardKey: 'fixed-60', requestKey }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const redemption = (
      results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<LoyaltyRedemptionModel>
    ).value;
    const replay = await loyalty.redeem(userId, { rewardKey: 'fixed-60', requestKey: redemption.requestKey });
    expect(replay.id).toBe(redemption.id);
    expect(await loyalty.balances(userId)).toMatchObject({ available: 40, lifetime: 100, used: 60 });
    code = (await CouponModel.findByPk(redemption.couponId!))!.code;
    await expect(
      new CartService().quote([{ productId: product.id, quantity: 1 }], code, otherId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      loyalty.redeem(userId, { rewardKey: 'percent-50', requestKey: redemption.requestKey }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it('reserves a voucher once, releases on order cancellation and consumes on completion', async () => {
    const subtotal = await new CartService().quote([{ productId: product.id, quantity: 1 }], code, userId);
    expect(subtotal.discount).toBe(50000);
    const settled = await Promise.allSettled(
      ['voucher-checkout-one', 'voucher-checkout-two'].map((key) => checkout(key, userId, code)),
    );
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const order = (settled.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<OrderModel>).value;
    expect((await CouponModel.findOne({ where: { code } }))!.reservedOrderId).toBe(order.id);
    await orders.cancelForUser(userId, order.id);
    const next = await checkout('voucher-checkout-three', userId, code);
    await deliver(next);
    expect((await CouponModel.findOne({ where: { code } }))!).toMatchObject({ reservedOrderId: null, usageCount: 1 });
    await expect(checkout('voucher-checkout-four', userId, code)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('reverses points from cumulative verified merchandise refunds, never a proposed intake amount', async () => {
    const before = await loyalty.balances(userId);
    const refund = {
      externalReference: 'refund-fixture-first',
      merchandiseVnd: 20001,
      moneyVerified: true,
      reason: 'Verified fixture partial payout',
    };
    await loyalty.confirmRefund(firstOrder.id, adminId, refund);
    await loyalty.confirmRefund(firstOrder.id, adminId, refund);
    expect((await loyalty.balances(userId)).lifetime).toBe(before.lifetime - 1);
    await loyalty.confirmRefund(firstOrder.id, adminId, {
      ...refund,
      externalReference: 'refund-fixture-second',
      merchandiseVnd: 19999,
    });
    expect((await loyalty.balances(userId)).lifetime).toBe(before.lifetime - 1);
    await expect(
      loyalty.confirmRefund(firstOrder.id, adminId, {
        ...refund,
        externalReference: 'refund-fixture-over',
        merchandiseVnd: 4000000,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(loyalty.confirmRefund(firstOrder.id, userId, refund)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('records debt after spent earnings are invalidated and recovers it on a later purchase', async () => {
    await loyalty.redeem(userId, { rewardKey: 'percent-100', requestKey: 'reward-debt-unique' });
    await loyalty.confirmRefund(firstOrder.id, adminId, {
      externalReference: 'refund-fixture-balance',
      merchandiseVnd: 3960000,
      moneyVerified: true,
      reason: 'Verified complete merchandise payout',
    });
    expect(await loyalty.balances(userId)).toMatchObject({ available: 0, debt: 62, lifetime: 98, used: 160 });
    await deliver(await checkout('debt-recovery-purchase'));
    expect(await loyalty.balances(userId)).toMatchObject({
      available: 38,
      debt: 0,
      lifetime: 198,
      used: 160,
      tier: { name: 'BRONZE' },
    });
  });
  it('deduplicates the verified invoice identity across different owners and photograph hashes', async () => {
    const evidence = async (ownerUserId: number, suffix: string) =>
      EvidenceModel.create({
        ownerUserId,
        purpose: 'loyalty_claim',
        diskKey: `fixture-${suffix}.jpg`,
        originalName: 'invoice.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
        sha256: suffix.padEnd(64, '0'),
      });
    const first = await loyalty.submitClaim(userId, {
      transactionReference: 'old-receipt-first',
      transactionDate: '2025-01-01',
      claimedVnd: 120000,
      evidenceIds: [(await evidence(userId, 'first')).id],
    });
    await expect(
      loyalty.submitClaim(userId, {
        transactionReference: 'old-receipt-first',
        transactionDate: '2025-01-01',
        claimedVnd: 160000,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const another = await loyalty.submitClaim(otherId, {
      transactionReference: 'old-receipt-recrop',
      transactionDate: '2025-01-01',
      claimedVnd: 120000,
      evidenceIds: [(await evidence(otherId, 'recrop')).id],
    });
    const decision = {
      decision: 'approved',
      recognizedVnd: 120000,
      verifiedReference: 'LEGACY-INVOICE-001',
      transactionVerified: true,
      reason: 'Original economic invoice verified',
    };
    await loyalty.reviewClaim(first.id, adminId, decision);
    await expect(loyalty.reviewClaim(another.id, adminId, decision)).rejects.toMatchObject({ statusCode: 409 });
    await expect(loyalty.claimDetail(first.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      loyalty.reviewClaim(another.id, adminId, { ...decision, verifiedReference: `ORDER:${firstOrder.id}` }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it('reserves a real gift SKU once and requires verified owned delivery and staff handover', async () => {
    const gift = await loyalty.createGift(adminId, {
        productId: product.id,
        pointsCost: 10,
        titleEn: 'Fixture model gift',
        titleVi: 'Quà mô hình thử nghiệm',
      }),
      stock = (await product.reload()).stock,
      sold = product.sold;
    expect(gift).toMatchObject({ createdByUserId: adminId, policyVersion: 1 });
    const redeemed = await loyalty.redeem(userId, { rewardKey: `gift-${gift.id}`, requestKey: 'gift-fixture-first' });
    await loyalty.redeem(userId, { rewardKey: `gift-${gift.id}`, requestKey: 'gift-fixture-first' });
    expect((await product.reload()).stock).toBe(stock - 1);
    await expect(loyalty.requestGift(redeemed.id, otherId, { shipping })).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      loyalty.fulfillGift(redeemed.id, adminId, { fulfillmentReference: 'GIFT-001', handoverVerified: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await loyalty.requestGift(redeemed.id, userId, { shipping });
    await loyalty.fulfillGift(redeemed.id, adminId, { fulfillmentReference: 'GIFT-001', handoverVerified: true });
    await loyalty.fulfillGift(redeemed.id, adminId, { fulfillmentReference: 'GIFT-001', handoverVerified: true });
    expect((await product.reload()).stock).toBe(stock - 1);
    await expect(db.query('UPDATE loyalty_ledger SET "balanceDelta"=0')).rejects.toThrow(/append-only/);
    expect(product.sold).toBe(sold + 1);
  });
  it('protects issued reward terms and referenced financial history at the database boundary', async () => {
    await expect(db.query('UPDATE coupon SET "fixedAmountVnd"=1 WHERE source=\'loyalty\'')).rejects.toThrow(
      /immutable/,
    );
    await expect(db.query("DELETE FROM coupon WHERE source='loyalty'")).rejects.toThrow(/cannot be deleted/);
    await expect(
      LoyaltyLedgerModel.create({
        userId: 2147483647,
        actorUserId: adminId,
        sourceReference: 'orphaned-member-fixture',
        kind: 'adjust',
        balanceDelta: 1,
        lifetimeDelta: 0,
        usedDelta: 0,
        policyVersion: 1,
        reason: 'Invalid fixture',
        details: {},
      }),
    ).rejects.toThrow(/foreign key/);
    await expect(ProductModel.destroy({ where: { id: product.id } })).rejects.toThrow(/foreign key/);
  });
  it('serializes a payout reference across different orders without duplicate refunds', async () => {
    const first = await deliver(await checkout('refund-concurrency-order-one'));
    const second = await deliver(await checkout('refund-concurrency-order-two'));
    const data = {
      externalReference: 'refund-cross-order-unique',
      merchandiseVnd: 1,
      moneyVerified: true,
      reason: 'Fixture bank identity concurrency',
    };
    const settled = await Promise.allSettled(
      [first, second].map((order) => loyalty.confirmRefund(order.id, adminId, data)),
    );
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((settled.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
    });
  });
  it('requires actual COD remittance before points and deduplicates verified collection', async () => {
    const order = await checkout('cod-collection-boundary-order');
    const data = {
      amountVnd: order.total,
      externalReference: 'COD-BOUNDARY-RECEIPT',
      reason: 'Fixture verified actual cash remittance',
      moneyVerified: true,
    };
    await expect(orders.confirmCollection(order.id, adminId, data)).rejects.toMatchObject({ statusCode: 409 });
    await orders.updateStatus(order.id, 'SHIPPED', adminId);
    const before = await loyalty.balances(userId);
    const delivered = await orders.updateStatus(order.id, 'DELIVERED', adminId);
    expect(delivered.paymentStatus).toBe('PENDING');
    expect((await loyalty.balances(userId)).available).toBe(before.available);
    await expect(orders.confirmCollection(order.id, userId, data)).rejects.toMatchObject({ statusCode: 403 });
    await expect(orders.confirmCollection(order.id, adminId, { ...data, moneyVerified: false })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      orders.confirmCollection(order.id, adminId, { ...data, amountVnd: order.total - 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const paid = await orders.confirmCollection(order.id, adminId, data);
    expect(paid.paymentStatus).toBe('PAID');
    await orders.confirmCollection(order.id, adminId, data);
    expect(await OrderReceiptModel.count({ where: { orderId: order.id } })).toBe(1);
    expect((await loyalty.balances(userId)).available).toBe(before.available + 100);
    await expect(orders.confirmCollection(order.id, adminId, { ...data, amountVnd: 1 })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(db.query('UPDATE order_receipt SET "amountVnd"=1')).rejects.toThrow(/append-only/);
  });
});
