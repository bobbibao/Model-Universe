import { Op } from 'sequelize';
import CheckoutSessionModel from '../database/client/models/CheckoutSession.Model';
import OrderModel from '../database/client/models/Order.Model';
import OrderPaymentLinkModel from '../database/client/models/OrderPaymentLink.Model';
import OrderShipmentModel from '../database/client/models/OrderShipment.Model';
import Logger from '../../../shared/server/utils/logger';
import { TERMINAL_SHIPMENT_STATUSES } from '../../../shared/fulfillment';
import CheckoutService from './CheckoutService';
import PaymentGatewayService from './PaymentGatewayService';
import FulfillmentService from './FulfillmentService';
import { paymentsEnabled } from './PaymentConfig';
import { superAiConfigured } from './delivery/SuperAiClient';
import OrderService from './OrderService';
import { CANCEL_REQUEST_HOURS } from '../../../shared/cancellation';

const MINUTE = 60_000;

// The safety net behind the webhooks (run every minute by the server): whatever payOS or SuperAI could not tell us —
// a webhook lost, the customer's tab closed — is asked for here, so an order never stays stuck between steps.
//   1. Open QR checkouts: payOS is asked about the payment (the order is created) and late ones expire.
//   2. Payment QRs of existing orders: payOS is asked; a confirmed payment is recorded.
//   3. Paid courier orders without a waybill: the automatic waybill is tried again (every 10 minutes per order).
//   4. Live waybills on the road: SuperAI's status is read back (each at most every 15 minutes).
//   5. Unpaid orders past their payment deadline are cancelled and their stock released (payOS asked once more first).
//   6. Cancellation requests staff left unanswered for CANCEL_REQUEST_HOURS are approved (refund flagged for staff).
// Every step is idempotent and limited per run; a failure is logged and retried on the next run.
export default class OrderSyncService {
  private static lastWaybillAttempt = new Map<number, number>();

  async run() {
    const steps: [string, () => Promise<unknown>][] = [
      ['checkout sessions', () => this.checkoutSessions()],
      ['order payments', () => this.orderPayments()],
      ['missing waybills', () => this.missingWaybills()],
      ['carrier statuses', () => this.carrierStatuses()],
      ['payment deadlines', () => this.paymentDeadlines()],
      ['cancellation requests', () => this.cancellationRequests()],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        Logger.ERROR(`Order sync (${name}) failed:`, error);
      }
    }
  }

  private async checkoutSessions() {
    if (!paymentsEnabled()) return;
    const sessions = await CheckoutSessionModel.findAll({
      where: {
        status: { [Op.in]: ['OPEN', 'PAID'] },
        [Op.or]: [{ lastCheckedAt: null }, { lastCheckedAt: { [Op.lt]: new Date(Date.now() - MINUTE) } }],
      },
      order: [['lastCheckedAt', 'ASC NULLS FIRST']],
      limit: 20,
    });
    const checkout = new CheckoutService();
    for (const session of sessions) await checkout.reconcile(session);
  }

  private async orderPayments() {
    if (!paymentsEnabled()) return;
    const links = await OrderPaymentLinkModel.findAll({
      where: {
        checkoutSessionId: null,
        orderId: { [Op.ne]: null },
        status: { [Op.in]: ['PENDING', 'PROCESSING'] },
        // Still payable, or expired within the last hour (a payment may have arrived just before the deadline).
        expiresAt: { [Op.gt]: new Date(Date.now() - 60 * MINUTE) },
        updatedAt: { [Op.lt]: new Date(Date.now() - 2 * MINUTE) },
      },
      order: [['updatedAt', 'ASC']],
      limit: 20,
    });
    const payments = new PaymentGatewayService();
    for (const link of links) {
      const order = await OrderModel.findByPk(link.orderId!);
      if (order) await payments.sync(order.id, order.userId);
      link.changed('updatedAt', true);
      await link.save();
    }
  }

  private async missingWaybills() {
    const paid = await OrderModel.findAll({
      where: { status: 'PROCESSING', fulfillmentMethod: 'COURIER_COD', prepaidVnd: { [Op.gt]: 0 } },
      order: [['id', 'ASC']],
      limit: 50,
    });
    const fulfillment = new FulfillmentService();
    let attempts = 0;
    for (const order of paid) {
      if (attempts >= 5 || order.prepaidVnd < order.upfrontDueVnd || order.cancelRequest?.status === 'PENDING') continue;
      const last = OrderSyncService.lastWaybillAttempt.get(order.id) || 0;
      if (Date.now() - last < 10 * MINUTE) continue;
      // Every parcel already has its waybill.
      if (!(await fulfillment.missingParcels(order.id)).length) continue;
      OrderSyncService.lastWaybillAttempt.set(order.id, Date.now());
      attempts += 1;
      await fulfillment.autoCreateShipment(order.id);
    }
  }

  private async paymentDeadlines() {
    const now = new Date();
    const overdue = await OrderModel.findAll({
      where: {
        status: 'PROCESSING',
        prepaidVnd: 0,
        paymentPlan: { [Op.ne]: null },
        [Op.or]: [
          { paymentDueAt: { [Op.lt]: now } },
          { paymentDueAt: null, createdAt: { [Op.lt]: new Date(now.getTime() - 24 * 60 * MINUTE) } },
        ],
      },
      order: [['id', 'ASC']],
      limit: 20,
    });
    const orders = new OrderService();
    const payments = new PaymentGatewayService();
    for (const order of overdue) {
      // A payment that reached payOS just before the deadline still counts.
      if (paymentsEnabled()) await payments.sync(order.id, order.userId).catch(() => undefined);
      if (await orders.systemCancel(order.id, 'payment_timeout', 'Quá hạn thanh toán') && paymentsEnabled())
        await payments.cancelOrderLinks(order.id, 'Order payment deadline passed');
    }
  }

  private async cancellationRequests() {
    const deadline = Date.now() - CANCEL_REQUEST_HOURS * 60 * MINUTE;
    const pending = await OrderModel.findAll({
      where: { status: 'PROCESSING', cancelRequest: { status: 'PENDING' } },
      order: [['id', 'ASC']],
      limit: 50,
    });
    const orders = new OrderService();
    for (const order of pending)
      if (order.cancelRequest && new Date(order.cancelRequest.requestedAt).getTime() < deadline)
        await orders.systemCancel(
          order.id,
          'customer_request',
          `Tự động chấp nhận yêu cầu huỷ sau ${CANCEL_REQUEST_HOURS} giờ`,
        );
  }

  private async carrierStatuses() {
    if (!superAiConfigured()) return;
    const shipments = await OrderShipmentModel.findAll({
      where: {
        mode: 'live',
        carrier: 'SUPERAI',
        status: { [Op.notIn]: [...TERMINAL_SHIPMENT_STATUSES] },
        [Op.or]: [{ lastSyncedAt: null }, { lastSyncedAt: { [Op.lt]: new Date(Date.now() - 15 * MINUTE) } }],
      },
      order: [['lastSyncedAt', 'ASC NULLS FIRST']],
      limit: 20,
    });
    const fulfillment = new FulfillmentService();
    for (const shipment of shipments) {
      const order = await OrderModel.findByPk(shipment.orderId);
      if (order) await fulfillment.refreshTracking(order.id, order.userId, true);
    }
  }
}
