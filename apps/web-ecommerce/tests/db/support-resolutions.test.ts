import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import ReturnService from '../../src/core/server/services/ReturnService';
import SupportResolutionService from '../../src/core/server/services/SupportResolutionService';
import LoyaltyService from '../../src/core/server/services/LoyaltyService';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import OrderRefundModel from '../../src/core/server/database/client/models/OrderRefund.Model';
import EvidenceModel from '../../src/core/server/database/client/models/Evidence.Model';
import ReturnEventModel from '../../src/core/server/database/client/models/ReturnEvent.Model';
import ReturnRequestModel from '../../src/core/server/database/client/models/ReturnRequest.Model';

describe('agreed model support on disposable PostgreSQL', () => {
  let db: Sequelize,
    product: ProductModel,
    replacement: ProductModel,
    adminId: number,
    userId: number,
    otherId: number,
    key = 0;
  const orders = new OrderService(),
    returns = new ReturnService(),
    support = new SupportResolutionService(),
    loyalty = new LoyaltyService();
  const shipping = {
    recipientName: 'Fixture Collector',
    phone: '0901234567',
    address: '12 Fixture Road',
    city: 'Fixture City',
  };
  const purchase = async (collect = true) => {
    const order = await orders.placeOrder(userId, {
      items: [{ productId: product.id, quantity: 1, size: '' }],
      shipping,
      requestKey: `support-purchase-${++key}`,
    });
    await orders.updateStatus(order.id, 'SHIPPED', adminId);
    await orders.updateStatus(order.id, 'DELIVERED', adminId);
    if (collect)
      await orders.confirmCollection(order.id, adminId, {
        amountVnd: order.total,
        externalReference: `SUPPORT-COD-${order.id}`,
        reason: 'Verified fixture remittance',
        moneyVerified: true,
      });
    return order;
  };
  const open = async (order: OrderModel, reason = 'missing_accessories', evidenceIds?: number[]) => {
    const detail = await orders.getForUser(userId, order.id),
      items = detail.get('items') as { id: number }[];
    return (await returns.create(userId, {
      orderId: order.id,
      items: [{ orderItemId: items[0].id, quantity: 1, reason }],
      ...(evidenceIds ? { evidenceIds } : {}),
    }))!;
  };
  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({ where: { stock: { [Op.gt]: 2 } }, order: [['id', 'ASC']] }))!;
    replacement = (await ProductModel.findOne({
      where: { id: { [Op.ne]: product.id }, stock: { [Op.gt]: 0 } },
      order: [['id', 'ASC']],
    }))!;
    await product.update({ price: 4000000, stock: 40 });
    await replacement.update({ isArchived: false, inventoryStatus: 'available' });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    [userId, otherId] = (await UserModel.findAll({ where: { role: 'USER' }, limit: 2, order: [['id', 'ASC']] })).map(
      (user) => user.id,
    );
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
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
      'Isolated support fixture; not a live policy approval',
    );
  }, 600000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close();
  });

  it('binds private owned evidence and supports the actual model reason codes', async () => {
    const order = await purchase();
    const photo = await EvidenceModel.create({
      ownerUserId: userId,
      purpose: 'return',
      diskKey: 'fixture-private.jpg',
      originalName: 'missing-accessory.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
      sha256: '1'.repeat(64),
    });
    const request = await open(order, 'missing_accessories', [photo.id]);
    const detail = await support.detail(request.id, userId);
    expect(detail.evidence[0]).toMatchObject({ id: photo.id, entityId: request.id });
    expect(detail.evidence[0].get({ plain: true })).not.toHaveProperty('diskKey');
    await expect(support.detail(request.id, otherId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(support.detail(request.id, otherId, true)).rejects.toMatchObject({ statusCode: 403 });
    for (const reason of ['wrong_item', 'undisclosed_defect', 'shipping_damage'])
      expect((await open(await purchase(), reason)).id).toBeGreaterThan(0);
  });
  it('requires the current accepted agreement and never treats a proposal as a payout', async () => {
    const request = await open(await purchase());
    const first = await support.offer(request.id, adminId, {
      expectedVersion: 0,
      outcome: 'partial_refund',
      refundVnd: 40000,
      details: 'Fixture missing accessory compensation',
    });
    const before = await OrderRefundModel.count({ where: { orderId: request.orderId } });
    await expect(
      support.fulfill(request.id, adminId, {
        expectedVersion: first.resolutionVersion,
        externalReference: 'UNACCEPTED-REFUND',
        details: 'Fixture payout',
        moneyVerified: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const second = await support.offer(request.id, adminId, {
      expectedVersion: 1,
      outcome: 'partial_refund',
      refundVnd: 80000,
      details: 'Revised agreed fixture compensation',
    });
    await expect(
      support.decide(request.id, userId, { expectedVersion: 1, decision: 'accepted' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      support.decide(request.id, otherId, { expectedVersion: 2, decision: 'accepted' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await support.decide(request.id, userId, { expectedVersion: second.resolutionVersion, decision: 'accepted' });
    await expect(
      support.offer(request.id, adminId, {
        expectedVersion: 2,
        outcome: 'repair',
        details: 'Unilateral changed terms',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await OrderRefundModel.count({ where: { orderId: request.orderId } })).toBe(before);
  });
  it('reserves actual exchange stock once and verifies handover without a second deduction', async () => {
    const request = await open(await purchase(), 'wrong_item');
    const stock = (await replacement.reload()).stock,
      sold = replacement.sold;
    await support.offer(request.id, adminId, {
      expectedVersion: 0,
      outcome: 'exchange',
      productId: replacement.id,
      quantity: 1,
      details: 'Actual replacement fixture SKU and condition',
    });
    const originalDefects = replacement.defects;
    await replacement.update({ defects: ['Fixture changed disclosure'] });
    await expect(
      support.decide(request.id, userId, { expectedVersion: 1, decision: 'accepted' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await replacement.update({ defects: originalDefects });
    await support.decide(request.id, userId, { expectedVersion: 1, decision: 'accepted' });
    await support.decide(request.id, userId, { expectedVersion: 1, decision: 'accepted' });
    expect((await replacement.reload()).stock).toBe(stock - 1);
    const data = {
      expectedVersion: 1,
      externalReference: 'EXCHANGE-HANDOVER-001',
      details: 'Fixture actual dispatch',
      handoverVerified: true,
    };
    await expect(support.fulfill(request.id, adminId, { ...data, handoverVerified: false })).rejects.toMatchObject({
      statusCode: 400,
    });
    await support.fulfill(request.id, adminId, data);
    await support.fulfill(request.id, adminId, data);
    expect((await replacement.reload()).stock).toBe(stock - 1);
    expect(replacement.sold).toBe(sold + 1);
    expect(await ReturnEventModel.count({ where: { returnRequestId: request.id, action: 'resolved' } })).toBe(1);
    await expect(ProductModel.destroy({ where: { id: replacement.id } })).rejects.toThrow(/foreign key/);
  });
  it('serializes two payout references for one case and reverses only verified net merchandise', async () => {
    const request = await open(await purchase(), 'undisclosed_defect');
    await support.offer(request.id, adminId, {
      expectedVersion: 0,
      outcome: 'partial_refund',
      refundVnd: 40001,
      details: 'Fixture verified defect agreement',
    });
    await support.decide(request.id, userId, { expectedVersion: 1, decision: 'accepted' });
    const before = await loyalty.balances(userId),
      data = { expectedVersion: 1, details: 'Fixture bank payout verified', moneyVerified: true };
    await expect(
      support.fulfill(request.id, adminId, { ...data, externalReference: 'SUPPORT-UNVERIFIED', moneyVerified: false }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const results = await Promise.allSettled(
      ['SUPPORT-REFUND-A', 'SUPPORT-REFUND-B'].map((externalReference) =>
        support.fulfill(request.id, adminId, { ...data, externalReference }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
    });
    expect(await OrderRefundModel.count({ where: { orderId: request.orderId } })).toBe(1);
    expect((await loyalty.balances(userId)).available).toBe(before.available - 2);
    expect((await support.detail(request.id, userId)).resolutionStatus).toBe('resolved');
    await expect(db.query("UPDATE return_event SET action='offered'")).rejects.toThrow(/append-only/);
  });
  it('keeps an unresolved case in dispute even after physical intake, and settles repair independently', async () => {
    const order = await purchase(false),
      request = await open(order, 'shipping_damage');
    const before = await loyalty.balances(userId),
      detail = await returns.getAdmin(request.id);
    const items = detail.get('items') as { id: number }[];
    await returns.intake(adminId, request.id, {
      decision: 'RECEIVED',
      items: items.map((item) => ({ id: item.id, condition: 'damaged', refundAmount: 0 })),
      adminNote: 'Fixture received damaged model',
    });
    await orders.confirmCollection(order.id, adminId, {
      amountVnd: order.total,
      externalReference: 'SUPPORT-DISPUTED-COD',
      moneyVerified: true,
      reason: 'Fixture actual collected payment',
    });
    expect((await loyalty.balances(userId)).available).toBe(before.available);
    await support.offer(request.id, adminId, {
      expectedVersion: 0,
      outcome: 'repair',
      details: 'Fixture actual repair and handback',
    });
    await support.decide(request.id, userId, { expectedVersion: 1, decision: 'accepted' });
    await support.fulfill(request.id, adminId, {
      expectedVersion: 1,
      externalReference: 'REPAIR-HANDOVER-001',
      details: 'Fixture repair completed and returned',
      handoverVerified: true,
    });
    expect((await loyalty.balances(userId)).available).toBe(before.available + 100);
    expect((await ReturnRequestModel.findByPk(request.id))!.status).toBe('RECEIVED');
  });
});
