import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import FulfillmentService from '../../src/core/server/services/FulfillmentService';
import VoucherService from '../../src/core/server/services/VoucherService';
import CouponService from '../../src/core/server/services/CouponService';
import NotificationDispatchService from '../../src/core/server/services/NotificationDispatchService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import AdminAlertModel from '../../src/core/server/database/client/models/AdminAlert.Model';
import CommerceNotificationModel from '../../src/core/server/database/client/models/CommerceNotification.Model';
import OrderShipmentModel from '../../src/core/server/database/client/models/OrderShipment.Model';
import OrderShipmentEventModel from '../../src/core/server/database/client/models/OrderShipmentEvent.Model';
import { vnDate } from '../../src/shared/fulfillment';

// Deposit orders with SPX COD or an in-person handover, and voucher rules 4.0 at checkout
// (docs/business/deposit-delivery-specification.md, docs/business/pricing-voucher-specification.md).
describe('deposit delivery and smart vouchers on disposable PostgreSQL', () => {
  let db: Sequelize, product: ProductModel, adminId: number, userId: number, otherId: number;
  let sequence = 0;
  const orders = new OrderService(), fulfillment = new FulfillmentService();
  const shipping = { recipientName: 'Fixture Collector', phone: '0901234567', address: '12 Fixture Road', city: 'Fixture City' };
  const place = (extra: Record<string, unknown>, quantity = 1) =>
    orders.placeOrder(userId, {
      items: [{ productId: product.id, quantity, size: '' }],
      shipping,
      paymentPlan: 'deposit',
      requestKey: `delivery-${++sequence}-${Date.now()}`,
      ...extra,
    });
  const deposit = (order: { id: number; upfrontDueVnd: number }, amountVnd = order.upfrontDueVnd) =>
    orders.recordPrepayment(order.id, adminId, { kind: 'receipt', amountVnd, externalReference: `DELIVERY-DEP-${order.id}-${++sequence}`, reason: 'Fixture verified deposit', moneyVerified: true });
  const box = { weightGram: 1200, lengthCm: 40, widthCm: 30, heightCm: 15 };

  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationDispatchService.prototype, 'dispatchSoon').mockReturnValue(undefined);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false, partnerId: null }, order: [['id', 'ASC']] }))!;
    await product.update({ price: 2_000_000, importPrice: 1_500_000, stock: 50, inventoryStatus: 'available' });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    [userId, otherId] = (await UserModel.findAll({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']], limit: 2 })).map((user) => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 600_000);
  afterAll(() => db.close());

  it('SPX COD: waybill only after the deposit, COD = balance + agreed fee, one active waybill, events drive the order', async () => {
    const order = await place({ fulfillmentMethod: 'SPX_COD', shippingFeeOnDelivery: true });
    expect(order.fulfillmentMethod).toBe('SPX_COD');
    expect(order.upfrontDueVnd).toBe(200_000);
    const requestKey = crypto.randomUUID();
    await expect(fulfillment.createShipment(adminId, order.id, { requestKey, package: box })).rejects.toMatchObject({ code: 'PREPAYMENT_REQUIRED' });
    await deposit(order);
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'cod_order_deposited' } })).toBe(1);
    // TC10: missing package dimensions block the waybill.
    await expect(fulfillment.createShipment(adminId, order.id, { requestKey, package: { weightGram: 1200 } })).rejects.toMatchObject({ statusCode: 400 });
    // TC16: an additional verified transfer before the waybill lowers the COD.
    await orders.recordPrepayment(order.id, adminId, { kind: 'topup', amountVnd: 300_000, externalReference: `DELIVERY-TOP-${order.id}`, reason: 'Fixture top-up', moneyVerified: true });
    const created = await fulfillment.createShipment(adminId, order.id, { requestKey, package: box });
    await fulfillment.createShipment(adminId, order.id, { requestKey, package: box }); // retried click
    const shipment = (await OrderShipmentModel.findAll({ where: { orderId: order.id } }));
    expect(shipment).toHaveLength(1);
    expect(shipment[0].codAmountVnd).toBe(1_500_000 + shipment[0].shippingFeeVnd);
    expect(shipment[0].trackingNumber).toMatch(/^SPXVN\d{12}$/);
    expect(created.status).toBe('PROCESSING');
    await expect(fulfillment.createShipment(adminId, order.id, { requestKey: crypto.randomUUID(), package: box })).rejects.toMatchObject({ code: 'WAYBILL_EXISTS' });
    await expect(orders.recordPrepayment(order.id, adminId, { kind: 'topup', amountVnd: 1_000, externalReference: `DELIVERY-LATE-${order.id}`, reason: 'Too late', moneyVerified: true })).rejects.toMatchObject({ code: 'WAYBILL_EXISTS' });
    expect(await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_shipment_created' } })).toBe(1);
    const id = shipment[0].id;
    expect((await fulfillment.staffEvent(adminId, id, { status: 'PICKED_UP' })).status).toBe('SHIPPED');
    // TC18: a failed delivery alerts the shop and leaves the order open.
    expect((await fulfillment.staffEvent(adminId, id, { status: 'DELIVERY_FAILED', reason: 'Customer unreachable' })).status).toBe('SHIPPED');
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'delivery_failed' } })).toBe(1);
    const delivered = await fulfillment.staffEvent(adminId, id, { status: 'DELIVERED' });
    // TC19: delivered, COD awaiting reconciliation.
    expect(delivered).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PENDING' });
    await expect(fulfillment.staffEvent(adminId, id, { status: 'IN_TRANSIT' })).rejects.toMatchObject({ code: 'SHIPMENT_TRANSITION' });
  });

  it('TC17: a repeated carrier webhook is recorded and notifies once', async () => {
    process.env.SPX_WEBHOOK_SECRET = 'fixture-webhook-secret';
    const order = await place({ fulfillmentMethod: 'SPX_COD' });
    await deposit(order);
    await fulfillment.createShipment(adminId, order.id, { requestKey: crypto.randomUUID(), package: box });
    const shipment = (await OrderShipmentModel.findOne({ where: { orderId: order.id } }))!;
    const body = { event_id: `evt-${order.id}`, tracking_number: shipment.trackingNumber, status: 'picked_up' };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = crypto.createHmac('sha256', 'fixture-webhook-secret').update(raw).digest('hex');
    await expect(fulfillment.webhook(raw, 'f'.repeat(64), body)).rejects.toMatchObject({ statusCode: 401 });
    await fulfillment.webhook(raw, signature, body);
    await fulfillment.webhook(raw, signature, body);
    expect(await OrderShipmentEventModel.count({ where: { providerEventId: `spx:evt-${order.id}` } })).toBe(1);
    expect(await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_shipment_picked_up' } })).toBe(1);
  });

  it('in-person handover: confirmed appointment, right code, verified balance; arrival alone completes nothing', async () => {
    const date = vnDate(new Date(Date.now() + 2 * 86_400_000));
    await expect(place({ fulfillmentMethod: 'DIRECT_MEETING', meeting: { date: '2000-01-01', slot: '09-12' } })).rejects.toMatchObject({ code: 'MEETING_INVALID' });
    const order = await place({ fulfillmentMethod: 'DIRECT_MEETING', meeting: { date, slot: '15-18' } });
    expect(order.meeting?.status).toBe('WAITING_FOR_APPOINTMENT');
    expect(order.handoverCode).toMatch(/^\d{6}$/);
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await expect(fulfillment.confirmMeeting(adminId, order.id, { address: 'Shop counter, District 1', at })).rejects.toMatchObject({ code: 'PREPAYMENT_REQUIRED' });
    await deposit(order);
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'meeting_order_deposited' } })).toBe(1);
    // A customer change request applies only after the shop confirms it; another customer cannot touch the order.
    await expect(fulfillment.requestMeetingChange(otherId, order.id, { address: 'Elsewhere 1', city: 'HCM', date, slot: '18-21' })).rejects.toMatchObject({ statusCode: 404 });
    const changed = await fulfillment.requestMeetingChange(userId, order.id, { address: 'Coffee shop 9', city: 'HCM', date, slot: '18-21' });
    expect(changed.meeting?.status).toBe('CHANGE_REQUESTED');
    const confirmed = await fulfillment.confirmMeeting(adminId, order.id, { address: 'Coffee shop 9, HCM', at });
    expect(confirmed.meeting).toMatchObject({ status: 'APPOINTMENT_CONFIRMED', changeRequest: null });
    expect(await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_meeting_confirmed' } })).toBe(1);
    const handover = { itemsChecked: true, moneyVerified: true, amountVnd: order.total - order.upfrontDueVnd, paymentMethod: 'cash' };
    await expect(fulfillment.completeHandover(adminId, order.id, { ...handover, handoverCode: '000000' === order.handoverCode ? '111111' : '000000' })).rejects.toMatchObject({ code: 'HANDOVER_CODE' });
    await expect(fulfillment.completeHandover(adminId, order.id, { ...handover, handoverCode: order.handoverCode, moneyVerified: false })).rejects.toMatchObject({ code: 'BALANCE_REQUIRED' });
    const done = await fulfillment.completeHandover(adminId, order.id, { ...handover, handoverCode: order.handoverCode });
    expect(done).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
    expect(done.meeting?.status).toBe('COMPLETED');
  });

  it('profit-guarded vouchers: refused over the floor, capped, budgeted and one per order', async () => {
    const coupons = new CouponService();
    const start = new Date(Date.now() - 86_400_000).toISOString(), end = new Date(Date.now() + 30 * 86_400_000).toISOString();
    // R 2,000,000 / C 1,500,000: S 1,800,000, L10 300,000, floor 240,000 → at most 13% off.
    await coupons.create({ code: 'GUARD25', title: 'Guarded 25%', discountPercent: 25, usageLimit: null, startDate: start, expirationDate: end, profitGuard: true });
    await expect(place({ couponCode: 'GUARD25', fulfillmentMethod: 'SPX_COD' })).rejects.toMatchObject({ code: 'VOUCHER_NOT_ELIGIBLE' });
    await coupons.create({ code: 'GUARD25CAP', title: 'Guarded 25% capped', discountPercent: 25, maxDiscountVnd: 250_000, budgetVnd: 300_000, usageLimit: null, startDate: start, expirationDate: end, profitGuard: true, isPublic: true });
    const order = await place({ couponCode: 'GUARD25CAP', fulfillmentMethod: 'SPX_COD' });
    expect(order.discount).toBe(250_000);
    // Deposit after the voucher (TC18 of the voucher specification).
    expect(order.upfrontDueVnd).toBe(175_000);
    expect((await CouponModel.findOne({ where: { code: 'GUARD25CAP' } }))!.budgetUsedVnd).toBe(250_000);
    await expect(place({ couponCode: 'GUARD25CAP', fulfillmentMethod: 'SPX_COD' })).rejects.toMatchObject({ code: 'VOUCHER_BUDGET' });
    await expect(place({ couponCode: 'GUARD25CAP', useMemberDiscount: true, fulfillmentMethod: 'SPX_COD' })).rejects.toMatchObject({ code: 'BENEFIT_CONFLICT' });
    await orders.cancelForUser(userId, order.id);
    expect((await CouponModel.findOne({ where: { code: 'GUARD25CAP' } }))!.budgetUsedVnd).toBe(0);
    // The wallet shows the public voucher; best voucher picks the largest saving.
    const evaluation = await new VoucherService().evaluateCart(userId, [{ productId: product.id, quantity: 1, size: '' }]);
    expect(evaluation.best?.code).toBe('GUARD25CAP');
  });

  it('monthly member code: issued once per month as an immutable copy, reminded before expiry', async () => {
    const coupons = new CouponService(), vouchers = new VoucherService();
    const start = new Date(Date.now() - 86_400_000).toISOString(), end = new Date(Date.now() + 365 * 86_400_000).toISOString();
    await coupons.create({ code: 'MEMBER10TPL', title: 'Member 10%', discountPercent: 10, minOrderVnd: 500_000, kind: 'member_template', usageLimit: null, startDate: start, expirationDate: end });
    await expect(place({ couponCode: 'MEMBER10TPL', fulfillmentMethod: 'SPX_COD' })).rejects.toMatchObject({ statusCode: 400 });
    const first = await vouchers.claimMonthly(userId);
    const again = await vouchers.claimMonthly(userId);
    expect(again.monthly?.code).toBe(first.monthly?.code);
    const code = (await CouponModel.findOne({ where: { ownerUserId: userId, kind: 'member' } }))!;
    expect(code).toMatchObject({ discountPercent: 10, profitGuard: true, usageLimit: 1 });
    await expect(coupons.update(code.id, { title: 'changed' })).rejects.toMatchObject({ statusCode: 409 });
    await code.update({ expirationDate: new Date(Date.now() + 20 * 3600_000) });
    expect(await vouchers.runExpiryReminders()).toBeGreaterThanOrEqual(1);
    expect(await vouchers.runExpiryReminders()).toBe(0);
    expect(await CommerceNotificationModel.count({ where: { userId, kind: 'voucher_expiring', entityId: code.id } })).toBe(1);
    expect(await CouponModel.count({ where: { kind: 'member', ownerUserId: { [Op.ne]: userId } } })).toBe(0);
  });
});
