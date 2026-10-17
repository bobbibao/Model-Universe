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
import PaymentGatewayService, { setPayOSClient } from '../../src/core/server/services/PaymentGatewayService';
import OrderModel from '../../src/core/server/database/client/models/Order.Model';
import OrderPrepaymentModel from '../../src/core/server/database/client/models/OrderPrepayment.Model';

// Without GHN credentials (tests disable them) addresses carry their names and orders are simulated.
const address = {
  provinceId: 202,
  provinceName: 'Hồ Chí Minh',
  wardId: 9001,
  wardName: 'Phường Bến Thành',
  street: '12 Lê Lợi',
  latitude: 10.7731,
  longitude: 106.7004,
};
const realAutoCreate = FulfillmentService.prototype.autoCreateShipment;

// Deposit orders with GHN COD or an in-person handover, payOS online payment, and voucher rules 4.0 at checkout
// (docs/business/deposit-delivery-specification.md, docs/business/pricing-voucher-specification.md).
describe('deposit delivery and smart vouchers on disposable PostgreSQL', () => {
  let db: Sequelize, product: ProductModel, adminId: number, userId: number, otherId: number;
  let sequence = 0;
  const orders = new OrderService(),
    fulfillment = new FulfillmentService();
  const shipping = {
    recipientName: 'Fixture Collector',
    phone: '0901234567',
    address: '12 Fixture Road',
    city: 'Fixture City',
  };
  const place = (extra: Record<string, unknown>, quantity = 1) =>
    orders.placeOrder(userId, {
      items: [{ productId: product.id, quantity, size: '' }],
      shipping,
      paymentPlan: 'deposit',
      requestKey: `delivery-${++sequence}-${Date.now()}`,
      ...extra,
    });
  const deposit = (order: { id: number; upfrontDueVnd: number }, amountVnd = order.upfrontDueVnd) =>
    orders.recordPrepayment(order.id, adminId, {
      kind: 'receipt',
      amountVnd,
      externalReference: `DELIVERY-DEP-${order.id}-${++sequence}`,
      reason: 'Fixture verified deposit',
      moneyVerified: true,
    });
  const box = { weightGram: 1200, lengthCm: 40, widthCm: 30, heightCm: 15 };

  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationDispatchService.prototype, 'dispatchSoon').mockReturnValue(undefined);
    // The background waybill after each verified payment is exercised explicitly in the payOS test.
    jest.spyOn(FulfillmentService.prototype, 'autoCreateShipment').mockResolvedValue(null);
    db = await seedTestDatabase();
    product = (await ProductModel.findOne({
      where: { condition: 'new', isArchived: false, partnerId: null },
      order: [['id', 'ASC']],
    }))!;
    await product.update({ price: 2_000_000, importPrice: 1_500_000, stock: 50, inventoryStatus: 'available' });
    await ProductDiscountModel.destroy({ where: { productId: product.id } });
    [userId, otherId] = (
      await UserModel.findAll({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']], limit: 2 })
    ).map((user) => user.id);
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 600_000);
  afterAll(() => db.close());

  it('GHN COD: fee in the total, deposit on merchandise, waybill only after the deposit, one active waybill, events drive the order', async () => {
    await expect(
      place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: { ...address, wardId: undefined } }),
    ).rejects.toMatchObject({ code: 'ADDRESS_INCOMPLETE' });
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    expect(order.fulfillmentMethod).toBe('COURIER_COD');
    expect(order).toMatchObject({
      provinceId: 202,
      wardId: 9001,
      ward: address.wardName,
      city: address.provinceName,
      address: address.street,
    });
    // The GHN fee is part of the total; the 10% minimum deposit is on the merchandise only.
    expect(order.shippingFee).toBeGreaterThan(0);
    expect(order.total).toBe(2_000_000 + order.shippingFee);
    expect(order.upfrontDueVnd).toBe(200_000);
    const requestKey = crypto.randomUUID();
    await expect(fulfillment.createShipment(adminId, order.id, { requestKey, package: box })).rejects.toMatchObject({
      code: 'PREPAYMENT_REQUIRED',
    });
    await deposit(order);
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'cod_order_deposited' } })).toBe(1);
    // TC10: missing package dimensions block the waybill.
    await expect(
      fulfillment.createShipment(adminId, order.id, { requestKey, package: { weightGram: 1200 } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    // TC16: an additional verified transfer before the waybill lowers the COD.
    await orders.recordPrepayment(order.id, adminId, {
      kind: 'topup',
      amountVnd: 300_000,
      externalReference: `DELIVERY-TOP-${order.id}`,
      reason: 'Fixture top-up',
      moneyVerified: true,
    });
    const created = await fulfillment.createShipment(adminId, order.id, { requestKey, package: box });
    await fulfillment.createShipment(adminId, order.id, { requestKey, package: box }); // retried click
    const shipment = await OrderShipmentModel.findAll({ where: { orderId: order.id } });
    expect(shipment).toHaveLength(1);
    expect(shipment[0]).toMatchObject({
      carrier: 'GHN',
      mode: 'simulate',
      feePayer: 'shop',
      carrierOrderId: `MU${order.id}`,
    });
    expect(shipment[0].codAmountVnd).toBe(order.total - 500_000);
    expect(shipment[0].trackingNumber).toMatch(/^SIM[0-9A-F]{7}$/);
    expect(created.status).toBe('PROCESSING');
    await expect(
      fulfillment.createShipment(adminId, order.id, { requestKey: crypto.randomUUID(), package: box }),
    ).rejects.toMatchObject({ code: 'WAYBILL_EXISTS' });
    await expect(
      orders.recordPrepayment(order.id, adminId, {
        kind: 'topup',
        amountVnd: 1_000,
        externalReference: `DELIVERY-LATE-${order.id}`,
        reason: 'Too late',
        moneyVerified: true,
      }),
    ).rejects.toMatchObject({ code: 'WAYBILL_EXISTS' });
    expect(
      await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_shipment_created' } }),
    ).toBe(1);
    const id = shipment[0].id;
    expect((await fulfillment.staffEvent(adminId, id, { status: 'PICKED_UP' })).status).toBe('SHIPPED');
    // TC18: a failed delivery alerts the shop and leaves the order open.
    expect(
      (await fulfillment.staffEvent(adminId, id, { status: 'DELIVERY_FAILED', reason: 'Customer unreachable' })).status,
    ).toBe('SHIPPED');
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'delivery_failed' } })).toBe(1);
    const delivered = await fulfillment.staffEvent(adminId, id, { status: 'DELIVERED' });
    // TC19: delivered, COD awaiting reconciliation.
    expect(delivered).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PENDING' });
    await expect(fulfillment.staffEvent(adminId, id, { status: 'IN_TRANSIT' })).rejects.toMatchObject({
      code: 'SHIPMENT_TRANSITION',
    });
  });

  it('TC17: the GHN callback needs its token, maps statuses and notifies once per event', async () => {
    process.env.GHN_WEBHOOK_TOKEN = 'fixture-ghn-webhook-token';
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(order);
    await fulfillment.createShipment(adminId, order.id, { requestKey: crypto.randomUUID(), package: box });
    const shipment = (await OrderShipmentModel.findOne({ where: { orderId: order.id } }))!;
    const body = {
      OrderCode: shipment.trackingNumber,
      ClientOrderCode: `MU${order.id}`,
      Type: 'switch_status',
      Status: 'picked',
      Time: '2026-10-17T03:00:00.000Z',
      Reason: '',
    };
    await expect(fulfillment.ghnWebhook('wrong-token', body)).rejects.toMatchObject({ statusCode: 401 });
    await fulfillment.ghnWebhook('fixture-ghn-webhook-token', body);
    await fulfillment.ghnWebhook('fixture-ghn-webhook-token', body);
    expect(
      await OrderShipmentEventModel.count({
        where: { providerEventId: `ghn:${shipment.trackingNumber}:switch_status:${body.Time}` },
      }),
    ).toBe(1);
    expect(
      await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_shipment_picked_up' } }),
    ).toBe(1);
    // GHN may skip states: delivered straight from picked; a final waybill ignores late events.
    await fulfillment.ghnWebhook('fixture-ghn-webhook-token', {
      ...body,
      Status: 'delivered',
      Time: '2026-10-18T03:00:00.000Z',
    });
    expect((await shipment.reload()).status).toBe('DELIVERED');
    await fulfillment.ghnWebhook('fixture-ghn-webhook-token', {
      ...body,
      Status: 'delivering',
      Time: '2026-10-19T03:00:00.000Z',
    });
    expect((await shipment.reload()).status).toBe('DELIVERED');
    expect(await fulfillment.ghnWebhook('fixture-ghn-webhook-token', { ...body, OrderCode: 'UNKNOWN1' })).toMatchObject(
      { recorded: false },
    );
  });

  it('payOS: only a verified payment counts, exactly once, and it creates the GHN order automatically', async () => {
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address, paymentPlan: 'full' });
    const created: Record<string, unknown>[] = [];
    let remote = { status: 'PENDING', amountPaid: 0, transactions: [] as { reference: string; amount: number }[] };
    setPayOSClient({
      paymentRequests: {
        create: async (data) => {
          created.push(data);
          return {
            checkoutUrl: `https://pay.payos.vn/web/${data.orderCode}`,
            paymentLinkId: `link-${data.orderCode}`,
            status: 'PENDING',
          };
        },
        get: async () => remote,
      },
      webhooks: {
        verify: async (body: unknown) => {
          const value = body as { signature: string; data: { orderCode: number; amount: number; reference: string } };
          if (value.signature !== 'valid') throw new Error('bad signature');
          return { ...value.data, code: '00' };
        },
      },
    });
    const payments = new PaymentGatewayService();
    await expect(payments.createLink(otherId, order.id)).rejects.toMatchObject({ statusCode: 404 });
    const link = await payments.createLink(userId, order.id);
    expect(link.amountVnd).toBe(order.total);
    expect(created[0]).toMatchObject({ amount: order.total, description: `MU${order.id}` });
    expect((await payments.createLink(userId, order.id)).checkoutUrl).toBe(link.checkoutUrl); // reused, not a second link
    // Returning from payOS proves nothing until payOS says PAID.
    expect((await payments.sync(order.id, userId)).paid).toBe(false);
    const orderCode = Number(created[0].orderCode);
    await expect(
      payments.webhook({ signature: 'forged', data: { orderCode, amount: order.total, reference: 'FT1' } }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await payments.webhook({
      signature: 'valid',
      data: { orderCode, amount: order.total, reference: 'FT26101700001' },
    });
    await payments.webhook({
      signature: 'valid',
      data: { orderCode, amount: order.total, reference: 'FT26101700001' },
    });
    remote = {
      status: 'PAID',
      amountPaid: order.total,
      transactions: [{ reference: 'FT26101700001', amount: order.total }],
    };
    expect((await payments.sync(order.id, userId)).paid).toBe(true);
    expect(await OrderPrepaymentModel.count({ where: { orderId: order.id } })).toBe(1);
    expect((await OrderModel.findByPk(order.id))!).toMatchObject({ prepaidVnd: order.total, paymentStatus: 'PAID' });
    await realAutoCreate.call(fulfillment, order.id);
    const shipment = (await OrderShipmentModel.findOne({ where: { orderId: order.id } }))!;
    expect(shipment).toMatchObject({ createdByUserId: null, codAmountVnd: 0 });
    setPayOSClient(null);
  });

  it('in-person handover: confirmed appointment, right code, verified balance; arrival alone completes nothing', async () => {
    const date = vnDate(new Date(Date.now() + 2 * 86_400_000));
    await expect(
      place({ fulfillmentMethod: 'DIRECT_MEETING', meeting: { date: '2000-01-01', slot: '09-12' } }),
    ).rejects.toMatchObject({ code: 'MEETING_INVALID' });
    const order = await place({ fulfillmentMethod: 'DIRECT_MEETING', meeting: { date, slot: '15-18' } });
    expect(order.meeting?.status).toBe('WAITING_FOR_APPOINTMENT');
    expect(order.handoverCode).toMatch(/^\d{6}$/);
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await expect(
      fulfillment.confirmMeeting(adminId, order.id, { address: 'Shop counter, District 1', at }),
    ).rejects.toMatchObject({ code: 'PREPAYMENT_REQUIRED' });
    await deposit(order);
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'meeting_order_deposited' } })).toBe(1);
    // A customer change request applies only after the shop confirms it; another customer cannot touch the order.
    await expect(
      fulfillment.requestMeetingChange(otherId, order.id, { address: 'Elsewhere 1', city: 'HCM', date, slot: '18-21' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const changed = await fulfillment.requestMeetingChange(userId, order.id, {
      address: 'Coffee shop 9',
      city: 'HCM',
      date,
      slot: '18-21',
    });
    expect(changed.meeting?.status).toBe('CHANGE_REQUESTED');
    const confirmed = await fulfillment.confirmMeeting(adminId, order.id, { address: 'Coffee shop 9, HCM', at });
    expect(confirmed.meeting).toMatchObject({ status: 'APPOINTMENT_CONFIRMED', changeRequest: null });
    expect(
      await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_meeting_confirmed' } }),
    ).toBe(1);
    const handover = {
      itemsChecked: true,
      moneyVerified: true,
      amountVnd: order.total - order.upfrontDueVnd,
      paymentMethod: 'cash',
    };
    await expect(
      fulfillment.completeHandover(adminId, order.id, {
        ...handover,
        handoverCode: '000000' === order.handoverCode ? '111111' : '000000',
      }),
    ).rejects.toMatchObject({ code: 'HANDOVER_CODE' });
    await expect(
      fulfillment.completeHandover(adminId, order.id, {
        ...handover,
        handoverCode: order.handoverCode,
        moneyVerified: false,
      }),
    ).rejects.toMatchObject({ code: 'BALANCE_REQUIRED' });
    const done = await fulfillment.completeHandover(adminId, order.id, {
      ...handover,
      handoverCode: order.handoverCode,
    });
    expect(done).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
    expect(done.meeting?.status).toBe('COMPLETED');
  });

  it('profit-guarded vouchers: refused over the floor, capped, budgeted and one per order', async () => {
    const coupons = new CouponService();
    const start = new Date(Date.now() - 86_400_000).toISOString(),
      end = new Date(Date.now() + 30 * 86_400_000).toISOString();
    // R 2,000,000 / C 1,500,000: S 1,800,000, L10 300,000, floor 240,000 → at most 13% off.
    await coupons.create({
      code: 'GUARD25',
      title: 'Guarded 25%',
      discountPercent: 25,
      usageLimit: null,
      startDate: start,
      expirationDate: end,
      profitGuard: true,
    });
    await expect(
      place({ couponCode: 'GUARD25', fulfillmentMethod: 'COURIER_COD', deliveryAddress: address }),
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_ELIGIBLE' });
    await coupons.create({
      code: 'GUARD25CAP',
      title: 'Guarded 25% capped',
      discountPercent: 25,
      maxDiscountVnd: 250_000,
      budgetVnd: 300_000,
      usageLimit: null,
      startDate: start,
      expirationDate: end,
      profitGuard: true,
      isPublic: true,
    });
    const order = await place({ couponCode: 'GUARD25CAP', fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    expect(order.discount).toBe(250_000);
    // Deposit after the voucher (TC18 of the voucher specification).
    expect(order.upfrontDueVnd).toBe(175_000);
    expect((await CouponModel.findOne({ where: { code: 'GUARD25CAP' } }))!.budgetUsedVnd).toBe(250_000);
    await expect(
      place({ couponCode: 'GUARD25CAP', fulfillmentMethod: 'COURIER_COD', deliveryAddress: address }),
    ).rejects.toMatchObject({ code: 'VOUCHER_BUDGET' });
    await expect(
      place({
        couponCode: 'GUARD25CAP',
        useMemberDiscount: true,
        fulfillmentMethod: 'COURIER_COD',
        deliveryAddress: address,
      }),
    ).rejects.toMatchObject({ code: 'BENEFIT_CONFLICT' });
    await orders.cancelForUser(userId, order.id);
    expect((await CouponModel.findOne({ where: { code: 'GUARD25CAP' } }))!.budgetUsedVnd).toBe(0);
    // The wallet shows the public voucher; best voucher picks the largest saving.
    const evaluation = await new VoucherService().evaluateCart(userId, [
      { productId: product.id, quantity: 1, size: '' },
    ]);
    expect(evaluation.best?.code).toBe('GUARD25CAP');
  });

  it('monthly member code: issued once per month as an immutable copy, reminded before expiry', async () => {
    const coupons = new CouponService(),
      vouchers = new VoucherService();
    const start = new Date(Date.now() - 86_400_000).toISOString(),
      end = new Date(Date.now() + 365 * 86_400_000).toISOString();
    await coupons.create({
      code: 'MEMBER10TPL',
      title: 'Member 10%',
      discountPercent: 10,
      minOrderVnd: 500_000,
      kind: 'member_template',
      usageLimit: null,
      startDate: start,
      expirationDate: end,
    });
    await expect(
      place({ couponCode: 'MEMBER10TPL', fulfillmentMethod: 'COURIER_COD', deliveryAddress: address }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const first = await vouchers.claimMonthly(userId);
    const again = await vouchers.claimMonthly(userId);
    expect(again.monthly?.code).toBe(first.monthly?.code);
    const code = (await CouponModel.findOne({ where: { ownerUserId: userId, kind: 'member' } }))!;
    expect(code).toMatchObject({ discountPercent: 10, profitGuard: true, usageLimit: 1 });
    await expect(coupons.update(code.id, { title: 'changed' })).rejects.toMatchObject({ statusCode: 409 });
    await code.update({ expirationDate: new Date(Date.now() + 20 * 3600_000) });
    expect(await vouchers.runExpiryReminders()).toBeGreaterThanOrEqual(1);
    expect(await vouchers.runExpiryReminders()).toBe(0);
    expect(
      await CommerceNotificationModel.count({ where: { userId, kind: 'voucher_expiring', entityId: code.id } }),
    ).toBe(1);
    expect(await CouponModel.count({ where: { kind: 'member', ownerUserId: { [Op.ne]: userId } } })).toBe(0);
  });
});
