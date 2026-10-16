import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import OrderModel from '../database/client/models/Order.Model';
import OrderShipmentModel from '../database/client/models/OrderShipment.Model';
import OrderShipmentEventModel from '../database/client/models/OrderShipmentEvent.Model';
import ProductModel from '../database/client/models/Product.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';
import {
  ACTIVE_SHIPMENT_STATUSES,
  codAmountVnd,
  DEFAULT_PACKAGE,
  isShipmentStatus,
  remainingProductVnd,
  SHIPMENT_TRANSITIONS,
  type OrderMeeting,
  type PackageSpec,
  type ShipmentStatus,
} from '../../../shared/fulfillment';
import { transferMemo } from '../../../shared/payment';
import OrderService, { validateMeetingRequest } from './OrderService';
import NotificationDispatchService from './NotificationDispatchService';
import FulfillmentNotices from './delivery/FulfillmentNotices';
import * as Messages from './delivery/Messages';
import { fakeWaybill, mapCarrierStatus, quoteFee, spxCodLimitVnd, spxMode, trackingUrl, verifyWebhookSignature } from './delivery/SpxCarrier';

const MAX_PARCEL_GRAM = 30_000;
const whole = (value: unknown, field: string, min = 0, max = 2_000_000_000) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw HttpError.badRequest(`Provide ${field} as a whole number.`);
  return value;
};

// Customer-visible statuses that get a website notice (DELIVERY_FAILED also gets an email).
const CUSTOMER_EVENT_KINDS: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: 'order_shipment_picked_up',
  IN_TRANSIT: 'order_shipment_in_transit',
  OUT_FOR_DELIVERY: 'order_shipment_out_for_delivery',
  DELIVERED: 'order_shipment_delivered',
  DELIVERY_FAILED: 'order_shipment_failed',
  RETURNING: 'order_shipment_returning',
  RETURNED: 'order_shipment_returned',
};

// In-person handovers ("GDTT") and SPX waybills for deposit orders (docs/business/deposit-delivery-specification.md).
export default class FulfillmentService {
  private orders = new OrderService();
  private notices = new NotificationDispatchService();
  private fulfillment = new FulfillmentNotices();

  private async admin(actorUserId: number, transaction: Transaction) {
    const actor = await UserModel.findByPk(actorUserId, { transaction });
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
  }

  private async lockedOrder(orderId: number, transaction: Transaction, userId?: number) {
    const order = await OrderModel.findOne({
      where: { id: orderId, ...(userId ? { userId } : {}) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
    return order;
  }

  private meetingOf(order: OrderModel): OrderMeeting {
    if (order.fulfillmentMethod !== 'DIRECT_MEETING' || !order.meeting) throw HttpError.conflict('This order is not an in-person handover.');
    return order.meeting;
  }

  private async saveMeeting(order: OrderModel, meeting: OrderMeeting, actorUserId: number, action: string, details: Record<string, unknown>, transaction: Transaction) {
    const next = { ...meeting, history: [...meeting.history, { at: new Date().toISOString(), actorUserId, action, details }] };
    order.set('meeting', next);
    order.changed('meeting', true);
    await order.save({ transaction });
    return next;
  }

  private depositVerified(order: OrderModel) {
    return order.status === 'PROCESSING' && order.prepaidVnd >= order.upfrontDueVnd && order.prepaidVnd > 0;
  }

  // --- In-person handover --------------------------------------------------------------------------------------

  async requestMeetingChange(userId: number, orderId: number, data: Record<string, unknown>) {
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const order = await this.lockedOrder(orderId, transaction, userId);
      const meeting = this.meetingOf(order);
      if (order.status !== 'PROCESSING' || ['COMPLETED', 'NOT_HELD'].includes(meeting.status))
        throw HttpError.conflict('The handover can no longer be changed.');
      const address = asTrimmedString(data.address), city = asTrimmedString(data.city);
      if (address.length < 4 || !city) throw HttpError.badRequest('Provide the proposed handover place and city.');
      const changeRequest = validateMeetingRequest(data, { address, city });
      const next = await this.saveMeeting(order, { ...meeting, status: 'CHANGE_REQUESTED', changeRequest }, userId, 'change_requested', { ...changeRequest }, transaction);
      const message = Messages.adminMeetingChange(transferMemo(order.id), `${address}, ${city}`, `${changeRequest.date} ${changeRequest.slot}`, order.id);
      await this.notices.alertAdmins({ kind: 'meeting_change_requested', orderId: order.id, dedupeKey: `order:${order.id}:meeting-change:${next.history.length}`, ...message }, transaction);
    });
    this.notices.dispatchSoon();
    return this.orders.getForUser(userId, orderId);
  }

  // Staff confirm the place and time (a pending change request is accepted with it). Only after the deposit is verified.
  async confirmMeeting(actorUserId: number, orderId: number, data: Record<string, unknown>) {
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const order = await this.lockedOrder(orderId, transaction);
      const meeting = this.meetingOf(order);
      if (!this.depositVerified(order)) throw HttpError.conflict('Verify the deposit before confirming the appointment.', 'PREPAYMENT_REQUIRED');
      if (['COMPLETED'].includes(meeting.status)) throw HttpError.conflict('The handover is already completed.');
      const address = asTrimmedString(data.address);
      const at = new Date(asTrimmedString(data.at));
      if (address.length < 4 || isNaN(at.getTime()) || at.getTime() < Date.now() - 3600_000)
        throw HttpError.badRequest('Provide the confirmed place and a future appointment time.');
      await this.saveMeeting(
        order,
        { ...meeting, status: 'APPOINTMENT_CONFIRMED', changeRequest: null, confirmedAddress: address, confirmedAt: at.toISOString(), confirmedByUserId: actorUserId },
        actorUserId,
        'confirmed',
        { address, at: at.toISOString(), acceptedChange: meeting.changeRequest },
        transaction,
      );
      const facts = await this.fulfillment.facts(order, transaction);
      const time = Messages.formatMeetingTime(at.toISOString());
      await this.notices.notifyCustomer(
        {
          userId: order.userId,
          kind: 'order_meeting_confirmed',
          entityId: order.id,
          dedupeKey: `order:${order.id}:meeting-confirmed:${at.toISOString()}:${address}`,
          details: { orderCode: facts.orderCode, address, at: at.toISOString(), remainingVnd: facts.remainingVnd },
          email: Messages.emailMeetingConfirmed(facts.orderCode, facts.customerName, address, time, facts.remainingVnd),
        },
        transaction,
      );
    });
    this.notices.dispatchSoon();
    return this.orders.getAdmin(orderId);
  }

  async markMeetingNotHeld(actorUserId: number, orderId: number, data: Record<string, unknown>) {
    const reason = asTrimmedString(data.reason);
    if (!reason || reason.length > 1000) throw HttpError.badRequest('Record why the handover did not take place.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const order = await this.lockedOrder(orderId, transaction);
      const meeting = this.meetingOf(order);
      if (meeting.status === 'COMPLETED') throw HttpError.conflict('The handover is already completed.');
      // The order is not completed or cancelled automatically: staff follow the published reschedule/cancel policy.
      await this.saveMeeting(order, { ...meeting, status: 'NOT_HELD' }, actorUserId, 'not_held', { reason }, transaction);
    });
    return this.orders.getAdmin(orderId);
  }

  // The handover itself: right order (handover code), items checked by the customer, the remaining balance verified.
  // Arriving at the meeting point alone never completes the order.
  async completeHandover(actorUserId: number, orderId: number, data: Record<string, unknown>) {
    const code = asTrimmedString(data.handoverCode), reason = asTrimmedString(data.reason) || 'In-person handover';
    const method = data.paymentMethod === 'transfer' ? 'transfer' : 'cash';
    if (data.itemsChecked !== true) throw HttpError.badRequest('Confirm the customer checked the products and quantities.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const order = await this.lockedOrder(orderId, transaction);
      const meeting = this.meetingOf(order);
      if (meeting.status !== 'APPOINTMENT_CONFIRMED') throw HttpError.conflict('Confirm the appointment before the handover.');
      if (!order.handoverCode || code !== order.handoverCode) throw HttpError.conflict('The handover code does not match this order.', 'HANDOVER_CODE');
      const balance = remainingProductVnd(order.total, order.prepaidVnd);
      if (balance > 0) {
        if (data.moneyVerified !== true || whole(data.amountVnd, 'the received balance', 1) !== balance)
          throw HttpError.conflict(`Verify receipt of exactly the remaining ${balance} VND.`, 'BALANCE_REQUIRED');
      }
      await this.orders.changeStatus(order, 'SHIPPED', transaction, actorUserId);
      await this.orders.changeStatus(order, 'DELIVERED', transaction, actorUserId);
      if (balance > 0) {
        const externalReference =
          method === 'transfer'
            ? asTrimmedString(data.externalReference).toUpperCase()
            : `CASH-${transferMemo(order.id)}-HANDOVER`;
        if (!/^[A-Z0-9:_.-]{8,128}$/.test(externalReference)) throw HttpError.badRequest('Provide the bank reference of the balance transfer.');
        await this.orders.recordCollection(order, actorUserId, { amountVnd: balance, externalReference, reason: `${reason} (${method})` }, transaction);
      }
      await this.saveMeeting(
        order,
        { ...meeting, status: 'COMPLETED', handoverAt: new Date().toISOString(), handoverByUserId: actorUserId },
        actorUserId,
        'handover',
        { balanceVnd: balance, paymentMethod: method },
        transaction,
      );
      await this.notices.notifyCustomer(
        { userId: order.userId, kind: 'order_handover_completed', entityId: order.id, dedupeKey: `order:${order.id}:handover`, details: { orderCode: transferMemo(order.id), balanceVnd: balance } },
        transaction,
      );
    });
    return this.orders.getAdmin(orderId);
  }

  // --- SPX waybills ----------------------------------------------------------------------------------------------

  private packageSpec(raw: unknown, declaredValueVnd: number): PackageSpec {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      weightGram: whole(value.weightGram, 'the package weight (g)', 1, 1_000_000),
      lengthCm: whole(value.lengthCm, 'the package length (cm)', 1, 1000),
      widthCm: whole(value.widthCm, 'the package width (cm)', 1, 1000),
      heightCm: whole(value.heightCm, 'the package height (cm)', 1, 1000),
      fragile: value.fragile !== false,
      declaredValueVnd,
      note: asTrimmedString(value.note).slice(0, 500) || null,
    };
  }

  // A default package from the ordered products (staff confirm or adjust it before the waybill).
  async suggestPackage(orderId: number): Promise<PackageSpec> {
    const items = await OrderItemModel.findAll({ where: { orderId } });
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    const order = await OrderModel.findByPk(orderId);
    return { ...DEFAULT_PACKAGE, weightGram: DEFAULT_PACKAGE.weightGram * Math.max(1, units), declaredValueVnd: order?.total ?? 0 };
  }

  async quote(orderId: number, data: Record<string, unknown>) {
    const order = await OrderModel.findByPk(orderId);
    if (!order) throw HttpError.notFound();
    const spec = this.packageSpec(data.package, order.total);
    const quote = quoteFee(spec);
    const feePayer = order.shippingFeePayer ?? 'shop';
    return { ...quote, mode: spxMode(), feePayer, codAmountVnd: codAmountVnd(order.total, order.prepaidVnd, quote.feeVnd, feePayer), codLimitVnd: spxCodLimitVnd() };
  }

  // Every pre-waybill check of the specification (§18); a failed check creates no waybill.
  async createShipment(actorUserId: number, orderId: number, data: Record<string, unknown>) {
    const requestKey = asTrimmedString(data.requestKey);
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(requestKey)) throw HttpError.badRequest('Invalid waybill request reference.');
    const mode = spxMode();
    let carrierError: string | null = null;
    try {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        await this.admin(actorUserId, transaction);
        const order = await this.lockedOrder(orderId, transaction);
        const replay = await OrderShipmentModel.findOne({ where: { requestKey }, transaction });
        if (replay) {
          if (replay.orderId !== orderId) throw HttpError.conflict('This waybill request reference belongs to another order.');
          return;
        }
        if (order.fulfillmentMethod !== 'SPX_COD') throw HttpError.conflict('Only SPX delivery orders get a waybill.');
        if (!this.depositVerified(order))
          throw HttpError.conflict('Verify at least the 10% deposit before creating the waybill.', 'PREPAYMENT_REQUIRED');
        if (!order.recipientName || !order.phone || !order.address || !order.city)
          throw HttpError.conflict('The recipient name, phone and full address are required.', 'ADDRESS_INCOMPLETE');
        const active = await OrderShipmentModel.findOne({ where: { orderId, status: { [Op.in]: [...ACTIVE_SHIPMENT_STATUSES] } }, transaction, lock: transaction.LOCK.UPDATE });
        if (active) throw HttpError.conflict('This delivery already has an active waybill.', 'WAYBILL_EXISTS');
        // Stock was taken when the order was placed; a discontinued or held product needs staff attention first.
        const items = await OrderItemModel.findAll({ where: { orderId }, transaction });
        const products = await ProductModel.findAll({ where: { id: items.map((item) => item.productId) }, transaction });
        if (products.some((product) => product.inventoryStatus !== 'available'))
          throw HttpError.conflict('A product of this order is held back from sale; resolve it before shipping.', 'STOCK_HELD');
        const spec = this.packageSpec(data.package, order.total);
        if (spec.weightGram > MAX_PARCEL_GRAM) {
          carrierError = `SPX từ chối kiện nặng ${spec.weightGram} g (tối đa ${MAX_PARCEL_GRAM} g).`;
          throw HttpError.conflict(carrierError, 'CARRIER_REJECTED');
        }
        const feePayer = data.feePayer === 'shop' ? 'shop' : order.shippingFeePayer ?? 'shop';
        let shippingFeeVnd = quoteFee(spec).feeVnd;
        let waybill = fakeWaybill(requestKey);
        if (mode === 'manual') {
          const trackingNumber = asTrimmedString(data.trackingNumber).toUpperCase();
          if (!/^[A-Z0-9-]{8,40}$/.test(trackingNumber)) throw HttpError.badRequest('Enter the tracking number SPX issued for this parcel.');
          shippingFeeVnd = whole(data.shippingFeeVnd, 'the SPX fee', 0, 10_000_000);
          waybill = { carrierOrderId: asTrimmedString(data.carrierOrderId) || trackingNumber, trackingNumber, trackingUrl: trackingUrl(trackingNumber) };
        }
        const balance = remainingProductVnd(order.total, order.prepaidVnd);
        const cod = codAmountVnd(order.total, order.prepaidVnd, shippingFeeVnd, feePayer);
        if (cod < 0) throw HttpError.conflict('The COD amount cannot be negative.');
        if (cod > spxCodLimitVnd()) throw HttpError.conflict(`COD ${cod} VND exceeds the SPX limit of ${spxCodLimitVnd()} VND.`, 'COD_LIMIT');
        if (await OrderShipmentModel.findOne({ where: { trackingNumber: waybill.trackingNumber }, transaction }))
          throw HttpError.conflict('This tracking number is already recorded.', 'TRACKING_REUSED');
        const shipment = await OrderShipmentModel.create(
          {
            orderId,
            createdByUserId: actorUserId,
            carrier: 'SPX',
            mode,
            requestKey,
            ...waybill,
            recipientSnapshot: { name: order.recipientName, phone: order.phone, address: order.address, ward: order.ward, district: order.district, city: order.city, note: order.note },
            packageSnapshot: spec,
            shippingFeeVnd,
            feePayer,
            codAmountVnd: cod,
            productBalanceVnd: balance,
            status: 'CREATED',
          },
          { transaction },
        );
        await OrderShipmentEventModel.create(
          { shipmentId: shipment.id, providerEventId: `created:${shipment.id}`, status: 'CREATED', applied: true, reason: null, actorUserId, details: { mode } },
          { transaction },
        );
        // Only now, with a valid tracking number, are the shop and the customer told about the waybill.
        const facts = await this.fulfillment.facts(order, transaction);
        const info = { trackingNumber: waybill.trackingNumber, codAmountVnd: cod, shippingFeeVnd, status: 'CREATED', trackingUrl: waybill.trackingUrl };
        await this.notices.alertAdmins({ kind: 'shipment_created', orderId, dedupeKey: `shipment:${shipment.id}:created`, ...Messages.adminShipmentCreated(facts, info, orderId) }, transaction);
        await this.notices.notifyCustomer(
          {
            userId: order.userId,
            kind: 'order_shipment_created',
            entityId: orderId,
            dedupeKey: `shipment:${shipment.id}:created-customer`,
            details: { orderCode: facts.orderCode, ...info },
            email: Messages.emailShipmentCreated(facts.orderCode, facts.customerName, info),
          },
          transaction,
        );
      });
    } catch (error) {
      if (carrierError) {
        // ZALO-04: the carrier refused; no waybill, no customer email.
        await this.notices.alertAdmins({
          kind: 'shipment_failed',
          orderId,
          dedupeKey: `order:${orderId}:waybill-failed:${requestKey}`,
          ...Messages.adminShipmentFailed(transferMemo(orderId), carrierError, orderId),
        });
        this.notices.dispatchSoon();
      }
      throw error;
    }
    this.notices.dispatchSoon();
    return this.orders.getAdmin(orderId);
  }

  async cancelShipment(actorUserId: number, shipmentId: number, data: Record<string, unknown>) {
    const reason = asTrimmedString(data.reason) || 'Cancelled by staff';
    return this.recordEvent({ shipmentId, status: 'CANCELLED', reason, providerEventId: `staff:${shipmentId}:cancel:${crypto.randomUUID()}`, actorUserId });
  }

  // Staff entry for manual waybills, or the simulator in fake mode.
  async staffEvent(actorUserId: number, shipmentId: number, data: Record<string, unknown>) {
    if (!isShipmentStatus(data.status)) throw HttpError.badRequest('Choose a shipment status.');
    const reason = asTrimmedString(data.reason).slice(0, 1000) || null;
    if (data.status === 'DELIVERY_FAILED' && !reason) throw HttpError.badRequest('Record why the delivery failed.');
    return this.recordEvent({ shipmentId, status: data.status, reason, providerEventId: `staff:${shipmentId}:${crypto.randomUUID()}`, actorUserId });
  }

  // SPX webhook: signed, deduplicated by the carrier's event id, mapped to internal statuses.
  async webhook(rawBody: Buffer | undefined, signature: unknown, body: Record<string, unknown>) {
    if (!verifyWebhookSignature(rawBody, signature)) throw HttpError.unauthorized('Invalid carrier signature.');
    const eventId = asTrimmedString(body.event_id), trackingNumber = asTrimmedString(body.tracking_number).toUpperCase();
    const status = mapCarrierStatus(body.status);
    if (!eventId || !trackingNumber) throw HttpError.badRequest('event_id and tracking_number are required.');
    const shipment = await OrderShipmentModel.findOne({ where: { trackingNumber } });
    if (!shipment) throw HttpError.notFound('Unknown tracking number.');
    if (!status) return { recorded: false, reason: 'unmapped status' };
    await this.recordEvent({ shipmentId: shipment.id, status, reason: asTrimmedString(body.reason) || null, providerEventId: `spx:${eventId}`, actorUserId: null, details: { carrierStatus: body.status } });
    return { recorded: true };
  }

  private async recordEvent(input: { shipmentId: number; status: ShipmentStatus; reason: string | null; providerEventId: string; actorUserId: number | null; details?: Record<string, unknown> }) {
    let orderId = 0;
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      if (input.actorUserId) await this.admin(input.actorUserId, transaction);
      const shipment = await OrderShipmentModel.findByPk(input.shipmentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!shipment) throw HttpError.notFound();
      orderId = shipment.orderId;
      if (await OrderShipmentEventModel.findOne({ where: { providerEventId: input.providerEventId }, transaction })) return; // repeated webhook
      const applied = SHIPMENT_TRANSITIONS[shipment.status].includes(input.status);
      if (!applied && input.actorUserId)
        throw HttpError.conflict(`A waybill in ${shipment.status} cannot become ${input.status}.`, 'SHIPMENT_TRANSITION');
      await OrderShipmentEventModel.create(
        { shipmentId: shipment.id, providerEventId: input.providerEventId, status: input.status, applied, reason: input.reason, actorUserId: input.actorUserId, details: input.details ?? {} },
        { transaction },
      );
      if (!applied) return;
      await shipment.update({ status: input.status, failureReason: input.status === 'DELIVERY_FAILED' ? input.reason : shipment.failureReason }, { transaction });
      const order = await this.lockedOrder(shipment.orderId, transaction);
      const actor = input.actorUserId ?? order.userId;
      // The order follows the parcel: picked up = shipped, delivered = delivered (COD still awaits reconciliation).
      if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(input.status) && order.status === 'PROCESSING')
        await this.orders.changeStatus(order, 'SHIPPED', transaction, actor);
      if (input.status === 'DELIVERED' && order.status === 'SHIPPED') await this.orders.changeStatus(order, 'DELIVERED', transaction, actor);
      const kind = CUSTOMER_EVENT_KINDS[input.status];
      const facts = await this.fulfillment.facts(order, transaction);
      if (input.status === 'DELIVERY_FAILED') {
        const reason = input.reason || 'Không rõ';
        await this.notices.alertAdmins({ kind: 'delivery_failed', orderId: order.id, dedupeKey: `shipment-event:${input.providerEventId}:admin`, ...Messages.adminDeliveryFailed(facts.orderCode, shipment.trackingNumber ?? '', reason, order.id) }, transaction);
      }
      if (kind)
        await this.notices.notifyCustomer(
          {
            userId: order.userId,
            kind,
            entityId: order.id,
            dedupeKey: `shipment-event:${input.providerEventId}`,
            details: { orderCode: facts.orderCode, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl, codAmountVnd: shipment.codAmountVnd, reason: input.reason },
            email:
              input.status === 'DELIVERY_FAILED'
                ? Messages.emailDeliveryFailed(facts.orderCode, facts.customerName, shipment.trackingNumber ?? '', input.reason || 'Không rõ')
                : null,
          },
          transaction,
        );
    });
    this.notices.dispatchSoon();
    return this.orders.getAdmin(orderId);
  }
}
