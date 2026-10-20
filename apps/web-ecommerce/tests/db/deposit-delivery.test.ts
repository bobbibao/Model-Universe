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
import CheckoutSessionModel from '../../src/core/server/database/client/models/CheckoutSession.Model';
import CustomerAddressModel from '../../src/core/server/database/client/models/CustomerAddress.Model';
import CheckoutService from '../../src/core/server/services/CheckoutService';
import ShipmentPrintService from '../../src/core/server/services/ShipmentPrintService';
import OrderSyncService from '../../src/core/server/services/OrderSyncService';
import ShippingService from '../../src/core/server/services/ShippingService';
import OrderPaymentLinkModel from '../../src/core/server/database/client/models/OrderPaymentLink.Model';
import type { PayOSLike } from '../../src/core/server/services/PaymentGatewayService';

// Without SuperAI credentials (tests disable them) addresses carry their names and waybills are simulated.
const address = {
  provinceCode: '79',
  provinceName: 'Thành phố Hồ Chí Minh',
  districtCode: '760',
  districtName: 'Quận 1',
  communeCode: '26734',
  communeName: 'Phường Bến Thành',
  street: '12 Lê Lợi',
  latitude: 10.7731,
  longitude: 106.7004,
};

// A payOS double: links are recorded, `remote` is what a status check returns, the signature 'valid' verifies.
const fakePayOS = () => {
  const created: Record<string, unknown>[] = [];
  const cancelled: number[] = [];
  const state = {
    remote: { status: 'PENDING', amountPaid: 0, transactions: [] as { reference: string; amount: number }[] },
  };
  const client: PayOSLike = {
    paymentRequests: {
      create: async (data) => {
        created.push(data);
        return {
          checkoutUrl: `https://pay.payos.vn/web/${data.orderCode}`,
          paymentLinkId: `link-${data.orderCode}`,
          status: 'PENDING',
          qrCode: `000201-fixture-${data.orderCode}`,
          bin: '970422',
          accountNumber: 'VQRFIXTURE1',
          accountName: 'MODEL UNIVERSE',
        };
      },
      get: async () => state.remote,
      cancel: async (orderCode: number) => {
        cancelled.push(orderCode);
        return {};
      },
    },
    webhooks: {
      verify: async (body: unknown) => {
        const value = body as { signature: string; data: { orderCode: number; amount: number; reference: string } };
        if (value.signature !== 'valid') throw new Error('bad signature');
        return { ...value.data, code: '00' };
      },
    },
  };
  return { client, created, cancelled, state };
};
const realAutoCreate = FulfillmentService.prototype.autoCreateShipment;

// Deposit orders with SuperAI courier COD or an in-person handover, payOS online payment (QR checkout sessions), and
// voucher rules 4.0 at checkout
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

  it('courier COD: fee in the total, deposit on merchandise, waybill only after the deposit, one active waybill, events drive the order', async () => {
    await expect(
      place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: { ...address, districtCode: undefined } }),
    ).rejects.toMatchObject({ code: 'ADDRESS_INCOMPLETE' });
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    expect(order.fulfillmentMethod).toBe('COURIER_COD');
    expect(order).toMatchObject({
      provinceCode: '79',
      districtCode: '760',
      communeCode: '26734',
      ward: address.communeName,
      district: address.districtName,
      city: address.provinceName,
      address: address.street,
    });
    expect(order.shippingQuote).toMatchObject({ source: 'estimate', feeVnd: order.shippingFee });
    // The carrier fee is part of the total; the 10% minimum deposit is on the merchandise only.
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
      carrier: 'SUPERAI',
      mode: 'simulate',
      feePayer: 'shop',
      carrierOrderId: `MU${order.id}`,
    });
    expect(shipment[0].codAmountVnd).toBe(order.total - 500_000);
    expect(shipment[0].trackingNumber).toMatch(/^SIM[0-9A-F]{9}$/);
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

  it('TC17: the SuperAI callback needs its token, maps statuses and notifies once per event', async () => {
    process.env.SUPERAI_WEBHOOK_TOKEN = 'fixture-superai-webhook-token';
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(order);
    await fulfillment.createShipment(adminId, order.id, { requestKey: crypto.randomUUID(), package: box });
    const shipment = (await OrderShipmentModel.findOne({ where: { orderId: order.id } }))!;
    const body = {
      type: 'update_status',
      code: shipment.trackingNumber,
      soc: `MU${order.id}`,
      status: '4',
      status_name: 'Đã Lấy Hàng',
      updated_at: '2026-10-18T10:00:00+07:00',
    };
    const token = 'fixture-superai-webhook-token';
    await expect(fulfillment.superAiWebhook('wrong-token', body)).rejects.toMatchObject({ statusCode: 401 });
    await fulfillment.superAiWebhook(token, body);
    await fulfillment.superAiWebhook(token, body);
    expect(
      await OrderShipmentEventModel.count({
        where: { providerEventId: `superai:${shipment.trackingNumber}:4:${body.updated_at}` },
      }),
    ).toBe(1);
    expect(
      await CommerceNotificationModel.count({ where: { entityId: order.id, kind: 'order_shipment_picked_up' } }),
    ).toBe(1);
    // Carriers may skip states: delivered straight from picked up; a final waybill ignores late events.
    await fulfillment.superAiWebhook(token, { ...body, status: '12', updated_at: '2026-10-19T10:00:00+07:00' });
    expect((await shipment.reload()).status).toBe('DELIVERED');
    await fulfillment.superAiWebhook(token, { ...body, status: '11', updated_at: '2026-10-20T10:00:00+07:00' });
    expect((await shipment.reload()).status).toBe('DELIVERED');
    expect(await fulfillment.superAiWebhook(token, { ...body, code: 'UNKNOWN1' })).toMatchObject({ recorded: false });
    expect(await fulfillment.superAiWebhook(token, { ...body, type: 'update_weight' })).toMatchObject({
      recorded: false,
    });
  });

  it('cancellation: a waybill waiting for pickup makes it a request; staff cancel it with the carrier; picked up blocks it', async () => {
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(order);
    await fulfillment.createShipment(adminId, order.id, { requestKey: crypto.randomUUID(), package: box });
    const requested = await orders.cancelForUser(userId, order.id, { reason: 'wrong_address' });
    expect(requested.cancelRequest).toMatchObject({ status: 'PENDING', reason: 'wrong_address' });
    expect(await AdminAlertModel.count({ where: { orderId: order.id, kind: 'cancel_requested' } })).toBe(1);
    // Rejected with a note the customer reads; the customer may ask again.
    await expect(orders.rejectCancelRequest(order.id, adminId, { note: 'no' })).rejects.toMatchObject({
      code: 'CANCEL_REASON_REQUIRED',
    });
    const rejected = await orders.rejectCancelRequest(order.id, adminId, { note: 'Đơn đã đóng gói, sắp giao.' });
    expect(rejected.cancelRequest).toMatchObject({ status: 'REJECTED' });
    await orders.cancelForUser(userId, order.id, { reason: 'other', note: 'Tôi cần đổi sang địa chỉ công ty' });
    const cancelled = await orders.updateStatus(order.id, 'CANCELLED', adminId, { reason: 'customer_request' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelRequest: { status: 'APPROVED' } });
    expect((await OrderShipmentModel.findOne({ where: { orderId: order.id } }))!.status).toBe('CANCELLED');
    // Once the carrier picked the parcel up, neither the customer nor staff can cancel.
    const shipped = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(shipped);
    await fulfillment.createShipment(adminId, shipped.id, { requestKey: crypto.randomUUID(), package: box });
    const waybill = (await OrderShipmentModel.findOne({ where: { orderId: shipped.id } }))!;
    await fulfillment.staffEvent(adminId, waybill.id, { status: 'PICKED_UP' });
    await expect(orders.cancelForUser(userId, shipped.id, { reason: 'changed_mind' })).rejects.toMatchObject({
      code: 'ORDER_IN_TRANSIT',
    });
  });

  it('end-of-day printing: paid orders without a waybill are listed, a print run records the labels and makes one PDF and a CSV', async () => {
    const printing = new ShipmentPrintService();
    const waiting = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(waiting);
    let queue = await printing.queue(adminId, {});
    expect(queue.needsWaybill.map((row) => row.orderId)).toContain(waiting.id);
    await fulfillment.createShipment(adminId, waiting.id, { requestKey: crypto.randomUUID(), package: box });
    queue = await printing.queue(adminId, {});
    expect(queue.needsWaybill.map((row) => row.orderId)).not.toContain(waiting.id);
    const label = queue.labels.find((row) => row.orderId === waiting.id)!;
    expect(label).toMatchObject({ carrierCode: expect.stringMatching(/^SIM/), labelPrintedAt: null });
    await expect(printing.queue(userId, {})).rejects.toMatchObject({ statusCode: 403 });
    const batch = await printing.createBatch(adminId, { shipmentIds: [label.shipmentId], size: '100x150' });
    expect(batch).toMatchObject({ labelCount: 1, reprintCount: 0, size: '100x150' });
    expect((await printing.queue(adminId, {})).labels.map((row) => row.shipmentId)).not.toContain(label.shipmentId);
    const pdf = await printing.pdf(adminId, batch.id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const csv = await printing.csv(adminId, batch.id);
    expect(csv).toContain(`MU${waiting.id}`);
    expect(csv).toContain(address.communeName);
    const again = await printing.createBatch(adminId, { shipmentIds: [label.shipmentId], size: 'A4' });
    expect(again.reprintCount).toBe(1);
    expect((await OrderShipmentModel.findByPk(label.shipmentId))!.printCount).toBe(2);
    // A parcel the carrier already picked up is no longer at the shop.
    await fulfillment.staffEvent(adminId, label.shipmentId, { status: 'PICKED_UP' });
    await expect(printing.createBatch(adminId, { shipmentIds: [label.shipmentId] })).rejects.toMatchObject({
      code: 'LABEL_NOT_PRINTABLE',
    });
  });

  it('QR checkout: no order until payOS confirms; plan switch replaces the QR; the paid session becomes one order and its address is saved', async () => {
    const payos = fakePayOS();
    setPayOSClient(payos.client);
    const previous = { ...process.env };
    process.env.PAYOS_CLIENT_ID = 'fixture-client';
    process.env.PAYOS_API_KEY = 'fixture-key';
    process.env.PAYOS_CHECKSUM_KEY = 'fixture-checksum';
    try {
      const checkout = new CheckoutService();
      const before = await OrderModel.count({ where: { userId } });
      const request = {
        items: [{ productId: product.id, quantity: 1, size: '' }],
        shipping: { ...shipping, recipientName: 'QR Collector', phone: '0907654321' },
        paymentPlan: 'deposit',
        depositVnd: 200_000,
        fulfillmentMethod: 'COURIER_COD',
        deliveryAddress: address,
        requestKey: `qr-${Date.now()}`,
      };
      const opened = await checkout.create(userId, request);
      expect(opened).toMatchObject({ status: 'OPEN', orderId: null, upfrontDueVnd: 200_000 });
      expect(opened.payment).toMatchObject({
        amountVnd: 200_000,
        accountNumber: 'VQRFIXTURE1',
        description: `MUC${opened.id}`,
      });
      expect(await OrderModel.count({ where: { userId } })).toBe(before);
      // The same request key returns the same open session (no second QR).
      expect((await checkout.create(userId, request)).id).toBe(opened.id);
      expect(payos.created).toHaveLength(1);
      // Another customer cannot see it.
      await expect(checkout.get(otherId, opened.id)).rejects.toMatchObject({ statusCode: 404 });
      // Switching to full payment cancels the first QR and opens a new one for the total.
      const full = await checkout.changePlan(userId, opened.id, { paymentPlan: 'full' });
      expect(full).toMatchObject({ paymentPlan: 'full', upfrontDueVnd: full.totalVnd });
      expect(payos.cancelled).toEqual([Number(payos.created[0].orderCode)]);
      expect(payos.created).toHaveLength(2);
      expect(await OrderModel.count({ where: { userId } })).toBe(before);
      // A forged confirmation changes nothing; the real one creates exactly one order with the payment recorded.
      const payments = new PaymentGatewayService();
      const orderCode = Number(payos.created[1].orderCode);
      await expect(
        payments.webhook({ signature: 'forged', data: { orderCode, amount: full.totalVnd, reference: 'FTQR1' } }),
      ).rejects.toMatchObject({ statusCode: 401 });
      await payments.webhook({
        signature: 'valid',
        data: { orderCode, amount: full.totalVnd, reference: 'FTQR26101800001' },
      });
      await payments.webhook({
        signature: 'valid',
        data: { orderCode, amount: full.totalVnd, reference: 'FTQR26101800001' },
      });
      const session = (await CheckoutSessionModel.findByPk(opened.id))!;
      expect(session).toMatchObject({ status: 'COMPLETED', paidVnd: full.totalVnd });
      expect(await OrderModel.count({ where: { userId } })).toBe(before + 1);
      const order = (await OrderModel.findByPk(session.orderId!))!;
      expect(order).toMatchObject({
        paymentPlan: 'full',
        prepaidVnd: full.totalVnd,
        paymentStatus: 'PAID',
        communeCode: '26734',
      });
      expect(await OrderPrepaymentModel.count({ where: { orderId: order.id } })).toBe(1);
      expect((await checkout.get(userId, opened.id)).orderId).toBe(order.id);
      // The delivery address joined the address book, once.
      const saved = await CustomerAddressModel.findAll({ where: { userId, requestKey: { [Op.like]: 'checkout-%' } } });
      expect(
        saved.filter((row) => row.delivery?.communeCode === '26734' && row.shipping.phone === '0907654321'),
      ).toHaveLength(1);
      // A session that is not paid in time expires without an order; cancelling closes it too.
      const late = await checkout.create(userId, { ...request, requestKey: `qr-late-${Date.now()}` });
      await CheckoutSessionModel.update(
        { expiresAt: new Date(Date.now() - 1000), lastCheckedAt: new Date() },
        { where: { id: late.id } },
      );
      expect((await checkout.get(userId, late.id)).status).toBe('EXPIRED');
      const dropped = await checkout.create(userId, { ...request, requestKey: `qr-cancel-${Date.now()}` });
      expect((await checkout.cancel(userId, dropped.id)).status).toBe('CANCELLED');
      expect(await OrderModel.count({ where: { userId } })).toBe(before + 1);
    } finally {
      setPayOSClient(null);
      for (const key of ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']) process.env[key] = previous[key];
    }
  });

  it('QR checkout holds the stock while the QR is open and gives it back on expiry; a late payment for a sold-out model is refunded', async () => {
    const payos = fakePayOS();
    setPayOSClient(payos.client);
    const previous = { ...process.env };
    process.env.PAYOS_CLIENT_ID = 'fixture-client';
    process.env.PAYOS_API_KEY = 'fixture-key';
    process.env.PAYOS_CHECKSUM_KEY = 'fixture-checksum';
    try {
      const checkout = new CheckoutService();
      const stock = (await product.reload()).stock;
      const request = {
        items: [{ productId: product.id, quantity: 2, size: '' }],
        shipping,
        paymentPlan: 'full',
        fulfillmentMethod: 'COURIER_COD',
        deliveryAddress: address,
      };
      const first = await checkout.create(userId, { ...request, requestKey: `qr-hold-1-${Date.now()}` });
      expect((await product.reload()).stock).toBe(stock - 2);
      // One open checkout per customer: a new one replaces the first and its hold.
      const opened = await checkout.create(userId, { ...request, requestKey: `qr-hold-2-${Date.now()}` });
      expect((await CheckoutSessionModel.findByPk(first.id))!.status).toBe('CANCELLED');
      expect((await product.reload()).stock).toBe(stock - 2);
      // Changing the plan keeps the hold (the preview counts the customer's own held stock).
      await checkout.changePlan(userId, opened.id, { paymentPlan: 'deposit' });
      expect((await product.reload()).stock).toBe(stock - 2);
      // Not paid in time: the QR expires and the stock comes back.
      await CheckoutSessionModel.update(
        { expiresAt: new Date(Date.now() - 1000), lastCheckedAt: new Date() },
        { where: { id: opened.id } },
      );
      expect((await checkout.get(userId, opened.id)).status).toBe('EXPIRED');
      expect((await product.reload()).stock).toBe(stock);
      // Someone else bought the last units; the money that arrives now cannot become the order: refund.
      await ProductModel.update({ stock: 0 }, { where: { id: product.id } });
      payos.state.remote = {
        status: 'PAID',
        amountPaid: opened.totalVnd,
        transactions: [{ reference: 'FTQRSOLDOUT1', amount: opened.totalVnd }],
      };
      const link = (await OrderPaymentLinkModel.findOne({
        where: { checkoutSessionId: opened.id },
        order: [['id', 'DESC']],
      }))!;
      await new PaymentGatewayService().webhook({
        signature: 'valid',
        data: { orderCode: link.providerOrderCode, amount: link.amountVnd, reference: 'FTQRSOLDOUT1' },
      });
      expect((await checkout.get(userId, opened.id)).status).toBe('FAILED');
      expect(
        await AdminAlertModel.count({
          where: { kind: 'payment_problem', dedupeKey: { [Op.like]: `checkout:${opened.id}:%` } },
        }),
      ).toBe(1);
      await ProductModel.update({ stock }, { where: { id: product.id } });
    } finally {
      setPayOSClient(null);
      for (const key of ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']) process.env[key] = previous[key];
    }
  });

  it('an unpaid order past its payment deadline is cancelled with its stock back; an unanswered cancellation request is approved after 24 hours', async () => {
    const stock = (await product.reload()).stock;
    const unpaid = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    expect(unpaid.paymentDueAt).toBeTruthy();
    expect((await product.reload()).stock).toBe(stock - 1);
    await OrderModel.update({ paymentDueAt: new Date(Date.now() - 1000) }, { where: { id: unpaid.id } });
    await expect(new PaymentGatewayService().createLink(userId, unpaid.id)).rejects.toMatchObject({
      code: 'PAYMENT_EXPIRED',
    });
    await new OrderSyncService().run();
    const expired = (await OrderModel.findByPk(unpaid.id))!;
    expect(expired).toMatchObject({ status: 'CANCELLED', cancelReason: 'payment_timeout', cancelledBy: 'system' });
    expect((await product.reload()).stock).toBe(stock);
    expect(await CommerceNotificationModel.count({ where: { entityId: unpaid.id, kind: 'order_cancelled' } })).toBe(1);

    const paid = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(paid);
    await orders.cancelForUser(userId, paid.id, { reason: 'changed_mind' });
    const order = (await OrderModel.findByPk(paid.id))!;
    await order.update({
      cancelRequest: { ...order.cancelRequest!, requestedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() },
    });
    await new OrderSyncService().run();
    expect(await order.reload()).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'system',
      cancelRequest: { status: 'APPROVED' },
    });
    expect(await AdminAlertModel.count({ where: { orderId: paid.id, kind: 'refund_due' } })).toBe(1);
  });

  it('payOS for an existing order: only a verified payment counts, exactly once, and it creates the waybill automatically', async () => {
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
    // The customer comes to the shop: the order's address is the shop's, whatever the client sent.
    await new ShippingService().saveShowroom(adminId, {
      name: 'MODEL universe',
      address: '99 Fixture Showroom Street, Quận 3',
      city: 'Thành phố Hồ Chí Minh',
      phone: '0900000000',
      openingHours: '9h – 21h',
    });
    await expect(
      place({ fulfillmentMethod: 'DIRECT_MEETING', meeting: { date: '2000-01-01', slot: '09-12' } }),
    ).rejects.toMatchObject({ code: 'MEETING_INVALID' });
    const order = await place({ fulfillmentMethod: 'DIRECT_MEETING', meeting: { date, slot: '15-18' } });
    expect(order.meeting?.status).toBe('WAITING_FOR_APPOINTMENT');
    expect(order).toMatchObject({ address: '99 Fixture Showroom Street, Quận 3', city: 'Thành phố Hồ Chí Minh' });
    expect(order.shippingFee).toBe(0);
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
    // Only the day and time change: the place stays the shop.
    expect(changed.meeting?.changeRequest).toMatchObject({
      address: '99 Fixture Showroom Street, Quận 3',
      slot: '18-21',
    });
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
    await orders.cancelForUser(userId, order.id, { reason: 'changed_mind' });
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

  it('keeps 50% of the deposit when the customer gives a paid order up, and refunds everything for shop reasons', async () => {
    const order = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(order);
    await orders.cancelForUser(userId, order.id, { reason: 'changed_mind' });
    const cancelled = await orders.updateStatus(order.id, 'CANCELLED', adminId, { reason: 'customer_request' });
    const fee = Math.floor(order.upfrontDueVnd / 2);
    expect((await OrderModel.findByPk(order.id))!.cancellationFeeVnd).toBe(fee);
    expect(cancelled).toBeTruthy();
    const notice = await CommerceNotificationModel.findOne({ where: { entityId: order.id, kind: 'order_cancelled' } });
    expect(notice?.details).toMatchObject({ feeVnd: fee, refundVnd: order.upfrontDueVnd - fee });
    // The shop's own reason: no fee.
    const second = await place({ fulfillmentMethod: 'COURIER_COD', deliveryAddress: address });
    await deposit(second);
    await orders.updateStatus(second.id, 'CANCELLED', adminId, { reason: 'out_of_stock' });
    expect((await OrderModel.findByPk(second.id))!.cancellationFeeVnd).toBe(0);
  });
});
