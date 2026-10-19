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
  billableWeightGram,
  estimateShippingFeeVnd,
  isShipmentStatus,
  remainingProductVnd,
  SHIPMENT_TRANSITIONS,
  TERMINAL_SHIPMENT_STATUSES,
  type DeliveryAddress,
  type OrderMeeting,
  type PackageSpec,
  type ShipmentStatus,
} from '../../../shared/fulfillment';
import { transferMemo } from '../../../shared/payment';
import OrderService, { validateMeetingRequest } from './OrderService';
import NotificationDispatchService from './NotificationDispatchService';
import FulfillmentNotices from './delivery/FulfillmentNotices';
import * as Messages from './delivery/Messages';
import * as SuperAi from './delivery/SuperAiClient';
import ShippingService from './ShippingService';
import Logger from '../../../shared/server/utils/logger';

const whole = (value: unknown, field: string, min = 0, max = 2_000_000_000) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw HttpError.badRequest(`Provide ${field} as a whole number.`);
  return value;
};

// The order's goods after discounts: its total without the shipping fee.
const goodsValueVnd = (order: OrderModel) => Math.max(0, order.total - (order.shippingFee || 0));

// Customer-visible statuses that get a website notice; EMAIL_STATUSES also get an email (and Zalo ZNS when set up).
const CUSTOMER_EVENT_KINDS: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: 'order_shipment_picked_up',
  IN_TRANSIT: 'order_shipment_in_transit',
  OUT_FOR_DELIVERY: 'order_shipment_out_for_delivery',
  DELIVERED: 'order_shipment_delivered',
  DELIVERY_FAILED: 'order_shipment_failed',
  RETURNING: 'order_shipment_returning',
  RETURNED: 'order_shipment_returned',
  EXCEPTION: 'order_shipment_exception',
};
const EMAIL_STATUSES: readonly ShipmentStatus[] = [
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING',
  'RETURNED',
  'EXCEPTION',
];

// In-person handovers ("GDTT") and SuperAI waybills for deposit orders (docs/business/deposit-delivery-specification.md).
export default class FulfillmentService {
  private orders = new OrderService();
  private notices = new NotificationDispatchService();
  private fulfillment = new FulfillmentNotices();
  private shipping = new ShippingService();

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
    if (order.fulfillmentMethod !== 'DIRECT_MEETING' || !order.meeting)
      throw HttpError.conflict('This order is not an in-person handover.');
    return order.meeting;
  }

  private async saveMeeting(
    order: OrderModel,
    meeting: OrderMeeting,
    actorUserId: number,
    action: string,
    details: Record<string, unknown>,
    transaction: Transaction,
  ) {
    const next = {
      ...meeting,
      history: [...meeting.history, { at: new Date().toISOString(), actorUserId, action, details }],
    };
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
      const address = asTrimmedString(data.address),
        city = asTrimmedString(data.city);
      if (address.length < 4 || !city) throw HttpError.badRequest('Provide the proposed handover place and city.');
      const changeRequest = validateMeetingRequest(data, { address, city });
      const next = await this.saveMeeting(
        order,
        { ...meeting, status: 'CHANGE_REQUESTED', changeRequest },
        userId,
        'change_requested',
        { ...changeRequest },
        transaction,
      );
      const message = Messages.adminMeetingChange(
        transferMemo(order.id),
        `${address}, ${city}`,
        `${changeRequest.date} ${changeRequest.slot}`,
        order.id,
      );
      await this.notices.alertAdmins(
        {
          kind: 'meeting_change_requested',
          orderId: order.id,
          dedupeKey: `order:${order.id}:meeting-change:${next.history.length}`,
          ...message,
        },
        transaction,
      );
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
      if (!this.depositVerified(order))
        throw HttpError.conflict('Verify the deposit before confirming the appointment.', 'PREPAYMENT_REQUIRED');
      if (['COMPLETED'].includes(meeting.status)) throw HttpError.conflict('The handover is already completed.');
      const address = asTrimmedString(data.address);
      const at = new Date(asTrimmedString(data.at));
      if (address.length < 4 || isNaN(at.getTime()) || at.getTime() < Date.now() - 3600_000)
        throw HttpError.badRequest('Provide the confirmed place and a future appointment time.');
      await this.saveMeeting(
        order,
        {
          ...meeting,
          status: 'APPOINTMENT_CONFIRMED',
          changeRequest: null,
          confirmedAddress: address,
          confirmedAt: at.toISOString(),
          confirmedByUserId: actorUserId,
        },
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
      await this.saveMeeting(
        order,
        { ...meeting, status: 'NOT_HELD' },
        actorUserId,
        'not_held',
        { reason },
        transaction,
      );
    });
    return this.orders.getAdmin(orderId);
  }

  // The handover itself: right order (handover code), items checked by the customer, the remaining balance verified.
  // Arriving at the meeting point alone never completes the order.
  async completeHandover(actorUserId: number, orderId: number, data: Record<string, unknown>) {
    const code = asTrimmedString(data.handoverCode),
      reason = asTrimmedString(data.reason) || 'In-person handover';
    const method = data.paymentMethod === 'transfer' ? 'transfer' : 'cash';
    if (data.itemsChecked !== true)
      throw HttpError.badRequest('Confirm the customer checked the products and quantities.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      const order = await this.lockedOrder(orderId, transaction);
      const meeting = this.meetingOf(order);
      if (meeting.status !== 'APPOINTMENT_CONFIRMED')
        throw HttpError.conflict('Confirm the appointment before the handover.');
      if (!order.handoverCode || code !== order.handoverCode)
        throw HttpError.conflict('The handover code does not match this order.', 'HANDOVER_CODE');
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
        if (!/^[A-Z0-9:_.-]{8,128}$/.test(externalReference))
          throw HttpError.badRequest('Provide the bank reference of the balance transfer.');
        await this.orders.recordCollection(
          order,
          actorUserId,
          { amountVnd: balance, externalReference, reason: `${reason} (${method})` },
          transaction,
        );
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
        {
          userId: order.userId,
          kind: 'order_handover_completed',
          entityId: order.id,
          dedupeKey: `order:${order.id}:handover`,
          details: { orderCode: transferMemo(order.id), balanceVnd: balance },
        },
        transaction,
      );
    });
    return this.orders.getAdmin(orderId);
  }

  // --- SuperAI waybills ------------------------------------------------------------------------------------------

  private packageSpec(raw: unknown, declaredValueVnd: number): PackageSpec {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      weightGram: whole(value.weightGram, 'the package weight (g)', 1, 50_000),
      lengthCm: whole(value.lengthCm, 'the package length (cm)', 1, 200),
      widthCm: whole(value.widthCm, 'the package width (cm)', 1, 200),
      heightCm: whole(value.heightCm, 'the package height (cm)', 1, 200),
      fragile: value.fragile !== false,
      declaredValueVnd,
      note: asTrimmedString(value.note).slice(0, 500) || null,
    };
  }

  // The default package from the shop's kit box and the ordered quantity (staff confirm or adjust it).
  async suggestPackage(orderId: number): Promise<PackageSpec> {
    const items = await OrderItemModel.findAll({ where: { orderId } });
    const order = await OrderModel.findByPk(orderId);
    const spec = await this.shipping.packageFor(items.reduce((sum, item) => sum + item.quantity, 0));
    return { ...spec, declaredValueVnd: order ? goodsValueVnd(order) : 0 };
  }

  private deliveryAddress(order: OrderModel): DeliveryAddress {
    return {
      provinceCode: order.provinceCode || '',
      provinceName: order.city,
      districtCode: order.districtCode || '',
      districtName: order.district || '',
      communeCode: order.communeCode || '',
      communeName: order.ward || '',
      street: order.address,
    };
  }

  // Every carrier's price for the package staff confirm (the order keeps the carrier checkout chose).
  async quote(orderId: number, data: Record<string, unknown>) {
    const order = await OrderModel.findByPk(orderId);
    if (!order) throw HttpError.notFound();
    const spec = this.packageSpec(data.package, goodsValueVnd(order));
    const quote = await this.shipping.quoteParcel({
      parcel: spec,
      address: this.deliveryAddress(order),
      goodsValueVnd: goodsValueVnd(order),
    });
    const chosen =
      quote.options.find((option) => option.carrierId === order.shippingQuote?.carrier?.carrierId) ?? quote.carrier;
    return {
      feeVnd: chosen?.feeVnd ?? quote.feeVnd,
      carrier: chosen,
      cheapest: quote.carrier,
      options: quote.options,
      mode: SuperAi.superAiOrderMode(),
      codAmountVnd: remainingProductVnd(order.total, order.prepaidVnd),
      codLimitVnd: SuperAi.shippingCodLimitVnd(),
    };
  }

  // After a verified deposit or full payment: create the SuperAI order with the default package, once. Skipped when
  // the shop turned automatic creation off, or the order is not a courier delivery. A failure alerts staff, who retry.
  async autoCreateShipment(orderId: number) {
    const order = await OrderModel.findByPk(orderId);
    if (!order || order.fulfillmentMethod !== 'COURIER_COD' || order.status !== 'PROCESSING') return null;
    const origin = await this.shipping.origin();
    if (origin && origin.autoCreate === false) return null;
    if (await OrderShipmentModel.findOne({ where: { orderId, status: { [Op.in]: [...ACTIVE_SHIPMENT_STATUSES] } } }))
      return null;
    try {
      return await this.createShipment(null, orderId, {
        requestKey: `auto-${orderId}-${order.prepaidVnd}`,
        package: await this.suggestPackage(orderId),
      });
    } catch (error) {
      Logger.WARN(`Automatic SuperAI order for ${orderId} failed: ${(error as Error).message}`);
      return null;
    }
  }

  // Every pre-waybill check of the specification (§18); a failed check creates no waybill. `actorUserId` null: the
  // automatic creation after a verified payment. The carrier is the one checkout chose (the cheapest quote then);
  // staff may pick another one (`carrierId`).
  async createShipment(actorUserId: number | null, orderId: number, data: Record<string, unknown>) {
    const requestKey = asTrimmedString(data.requestKey);
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(requestKey)) throw HttpError.badRequest('Invalid waybill request reference.');
    const mode = SuperAi.superAiOrderMode();
    let carrierError: string | null = null;
    try {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        if (actorUserId !== null) await this.admin(actorUserId, transaction);
        const order = await this.lockedOrder(orderId, transaction);
        const replay = await OrderShipmentModel.findOne({ where: { requestKey }, transaction });
        if (replay) {
          if (replay.orderId !== orderId)
            throw HttpError.conflict('This waybill request reference belongs to another order.');
          return;
        }
        if (order.fulfillmentMethod !== 'COURIER_COD')
          throw HttpError.conflict('Only courier delivery orders get a waybill.');
        if (!this.depositVerified(order))
          throw HttpError.conflict(
            'Verify at least the 10% deposit before creating the waybill.',
            'PREPAYMENT_REQUIRED',
          );
        if (!order.recipientName || !order.phone || !order.address || !order.city || !order.district || !order.ward)
          throw HttpError.conflict(
            'The recipient name, phone, ward, district and province are required.',
            'ADDRESS_INCOMPLETE',
          );
        const active = await OrderShipmentModel.findOne({
          where: { orderId, status: { [Op.in]: [...ACTIVE_SHIPMENT_STATUSES] } },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (active) throw HttpError.conflict('This delivery already has an active waybill.', 'WAYBILL_EXISTS');
        const items = await OrderItemModel.findAll({ where: { orderId }, transaction });
        const products = await ProductModel.findAll({
          where: { id: items.map((item) => item.productId) },
          transaction,
        });
        if (products.some((product) => product.inventoryStatus !== 'available'))
          throw HttpError.conflict(
            'A product of this order is held back from sale; resolve it before shipping.',
            'STOCK_HELD',
          );
        const spec = this.packageSpec(data.package, goodsValueVnd(order));
        const cod = remainingProductVnd(order.total, order.prepaidVnd);
        if (cod > SuperAi.shippingCodLimitVnd())
          throw HttpError.conflict(
            `COD ${cod} VND exceeds the shop's COD limit of ${SuperAi.shippingCodLimitVnd()} VND; record a top-up first.`,
            'COD_LIMIT',
          );
        const origin = await this.shipping.origin();
        if (!origin && mode === 'live')
          throw HttpError.conflict(
            'Choose the SuperAI pickup warehouse first (Admin → Delivery).',
            'SHIPPING_ORIGIN_MISSING',
          );
        // The carrier: staff's choice, else the one checkout chose, else today's cheapest.
        const requestedCarrier = Number(data.carrierId);
        let carrier = order.shippingQuote?.carrier ?? null;
        if (Number.isSafeInteger(requestedCarrier) && requestedCarrier > 0 && requestedCarrier !== carrier?.carrierId) {
          const quote = await this.shipping.quoteParcel({
            parcel: spec,
            address: this.deliveryAddress(order),
            goodsValueVnd: goodsValueVnd(order),
          });
          carrier = quote.options.find((option) => option.carrierId === requestedCarrier) ?? null;
          if (!carrier) throw HttpError.conflict('This carrier does not serve the address now.', 'CARRIER_UNAVAILABLE');
        }
        if (!carrier && SuperAi.superAiConfigured())
          carrier = (
            await this.shipping.quoteParcel({
              parcel: spec,
              address: this.deliveryAddress(order),
              goodsValueVnd: goodsValueVnd(order),
            })
          ).carrier;
        // The shop's own order code (SuperAI `soc`); a second waybill after a cancellation gets a suffix.
        const previous = await OrderShipmentModel.count({ where: { orderId }, transaction });
        const soc = previous ? `MU${orderId}-${previous + 1}` : `MU${orderId}`;
        let created: SuperAi.CreatedOrder;
        if (mode === 'live') {
          try {
            created = await SuperAi.createOrder({
              pickupCode: origin!.warehouseCode,
              carrierId: carrier!.carrierId,
              name: order.recipientName,
              phone: order.phone,
              address: order.address,
              province: order.city,
              district: order.district || '',
              commune: order.ward || '',
              codAmountVnd: cod,
              valueVnd: goodsValueVnd(order),
              weightGram: billableWeightGram(spec),
              soc,
              note: [order.note, spec.fragile ? 'Hàng dễ vỡ, xin nhẹ tay.' : null, spec.note].filter(Boolean).join(' '),
              config: origin!.viewConfig,
              products: items.map((item) => ({
                sku: String(item.productId),
                name: item.productName,
                price: item.unitPrice,
                weight: Math.max(1, Math.round(billableWeightGram(spec) / Math.max(1, items.length))),
                quantity: item.quantity,
              })),
            });
          } catch (error) {
            carrierError = (error as Error).message;
            throw error;
          }
        } else {
          created = {
            superaiCode: SuperAi.simulatedOrderCode(requestKey),
            shortCode: null,
            carrierId: carrier?.carrierId ?? 0,
            carrierName: carrier?.carrierName ?? 'Mô phỏng',
            carrierCode: SuperAi.simulatedOrderCode(`${requestKey}:carrier`),
            feeVnd: carrier?.shipmentFeeVnd ?? estimateShippingFeeVnd(spec),
            insuranceVnd: carrier?.insuranceFeeVnd ?? 0,
            status: '2',
          };
        }
        const carrierName = created.carrierName || carrier?.carrierName || 'SuperAI';
        const trackingUrl = SuperAi.carrierTrackingUrl(created.carrierId, created.carrierCode);
        const shippingFeeVnd = created.feeVnd + created.insuranceVnd;
        const shipment = await OrderShipmentModel.create(
          {
            orderId,
            createdByUserId: actorUserId,
            carrier: 'SUPERAI',
            carrierId: created.carrierId || null,
            carrierName,
            carrierCode: created.carrierCode,
            mode,
            requestKey,
            carrierOrderId: soc,
            trackingNumber: created.superaiCode,
            trackingUrl,
            recipientSnapshot: {
              name: order.recipientName,
              phone: order.phone,
              address: order.address,
              ward: order.ward,
              district: order.district,
              city: order.city,
              provinceCode: order.provinceCode,
              districtCode: order.districtCode,
              communeCode: order.communeCode,
              note: order.note,
            },
            packageSnapshot: spec,
            shippingFeeVnd,
            feePayer: 'shop',
            codAmountVnd: cod,
            productBalanceVnd: cod,
            status: 'AWAITING_PICKUP',
            carrierStatus: created.status,
            expectedDeliveryAt: null,
          },
          { transaction },
        );
        await OrderShipmentEventModel.create(
          {
            shipmentId: shipment.id,
            providerEventId: `created:${shipment.id}`,
            status: 'AWAITING_PICKUP',
            applied: true,
            reason: null,
            actorUserId,
            carrierStatus: created.status,
            details: { mode, automatic: actorUserId === null, carrierId: created.carrierId, carrierName },
          },
          { transaction },
        );
        // Only now, with a real waybill, are the shop and the customer told about it.
        const facts = await this.fulfillment.facts(order, transaction);
        const code = created.carrierCode || created.shortCode || created.superaiCode;
        const info = {
          carrierName,
          trackingNumber: code,
          codAmountVnd: cod,
          shippingFeeVnd,
          status: `Chờ ${carrierName} lấy hàng`,
          trackingUrl: trackingUrl || Messages.orderTrackingUrl(orderId),
          estimatedDelivery: carrier?.estimatedDelivery ?? null,
        };
        await this.notices.alertAdmins(
          {
            kind: 'shipment_created',
            orderId,
            dedupeKey: `shipment:${shipment.id}:created`,
            ...Messages.adminShipmentCreated(facts, info, orderId),
          },
          transaction,
        );
        await this.notices.notifyCustomer(
          {
            userId: order.userId,
            kind: 'order_shipment_created',
            entityId: orderId,
            dedupeKey: `shipment:${shipment.id}:created-customer`,
            details: { orderCode: facts.orderCode, ...info },
            email: Messages.emailShipmentCreated(facts.orderCode, facts.customerName, info),
            zns: {
              phone: order.phone,
              event: 'created',
              orderCode: facts.orderCode,
              trackingNumber: code,
              statusText: info.status,
            },
          },
          transaction,
        );
      });
    } catch (error) {
      if (carrierError) {
        // The carrier refused: no waybill, no customer email; staff see why and can retry.
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

  // `actorUserId` null: the system (an automatic cancellation of the order).
  async cancelShipment(actorUserId: number | null, shipmentId: number, data: Record<string, unknown>) {
    const reason = asTrimmedString(data.reason) || 'Cancelled by staff';
    const shipment = await OrderShipmentModel.findByPk(shipmentId);
    if (!shipment) throw HttpError.notFound();
    if (
      shipment.mode === 'live' &&
      shipment.carrier === 'SUPERAI' &&
      shipment.trackingNumber &&
      !TERMINAL_SHIPMENT_STATUSES.includes(shipment.status)
    )
      await SuperAi.cancelOrder(shipment.trackingNumber);
    return this.recordEvent({
      shipmentId,
      status: 'CANCELLED',
      reason,
      providerEventId: `${actorUserId ? 'staff' : 'system'}:${shipmentId}:cancel:${crypto.randomUUID()}`,
      actorUserId,
    });
  }

  // Simulation (simulate mode) or a manual correction by staff.
  async staffEvent(actorUserId: number, shipmentId: number, data: Record<string, unknown>) {
    if (!isShipmentStatus(data.status)) throw HttpError.badRequest('Choose a shipment status.');
    const reason = asTrimmedString(data.reason).slice(0, 1000) || null;
    if (data.status === 'DELIVERY_FAILED' && !reason) throw HttpError.badRequest('Record why the delivery failed.');
    return this.recordEvent({
      shipmentId,
      status: data.status,
      reason,
      providerEventId: `staff:${shipmentId}:${crypto.randomUUID()}`,
      actorUserId,
    });
  }

  // SuperAI webhook (order status callback). SuperAI does not sign it: the URL carries our secret token, and for a live
  // waybill the status is read back from SuperAI's API rather than trusted from the body. Deduplicated by order code,
  // status and update time. Answers 200 for unknown orders so SuperAI does not retry them.
  async superAiWebhook(token: unknown, body: Record<string, unknown>) {
    if (!SuperAi.verifySuperAiWebhook(token)) throw HttpError.unauthorized('Invalid carrier webhook token.');
    const code = asTrimmedString(body.code);
    if (!code) throw HttpError.badRequest('code is required.');
    Logger.INFO(`SuperAI webhook ${asTrimmedString(body.type)} ${code}: ${asTrimmedString(body.status)}`);
    const shipment = await OrderShipmentModel.findOne({ where: { trackingNumber: code, carrier: 'SUPERAI' } });
    if (!shipment) return { recorded: false, reason: 'unknown order' };
    if (body.type !== 'update_status') return { recorded: false, reason: 'not a status change' };
    let carrierStatus = asTrimmedString(body.status),
      updatedAt = asTrimmedString(body.updated_at) || asTrimmedString(body.pushed_at);
    if (shipment.mode === 'live') {
      const info = await SuperAi.orderInfo(code);
      carrierStatus = info.status;
      updatedAt = info.updatedAt || updatedAt;
      if (info.carrierCode && info.carrierCode !== shipment.carrierCode)
        await shipment.update({
          carrierCode: info.carrierCode,
          trackingUrl: SuperAi.carrierTrackingUrl(info.carrierId, info.carrierCode),
        });
    }
    const status = SuperAi.mapSuperAiStatus(carrierStatus);
    if (!status) return { recorded: false, reason: 'unknown status' };
    const reasonText = asTrimmedString(body.reason_text) || null;
    await this.recordEvent({
      shipmentId: shipment.id,
      status,
      reason: reasonText,
      providerEventId: `superai:${code}:${carrierStatus}:${updatedAt}`.slice(0, 250),
      actorUserId: null,
      carrierStatus,
      details: {
        statusName: body.status_name ?? null,
        reasonCode: body.reason_code ?? null,
        fee: body.fshipment ?? null,
        weight: body.weight ?? null,
        partial: body.partial ?? null,
      },
    });
    return { recorded: true };
  }

  // Pulls the latest SuperAI status (customer "refresh", staff, and local development where no webhook can reach us).
  // At most once a minute per waybill.
  async refreshTracking(orderId: number, userId: number, admin = false) {
    const order = await OrderModel.findOne({ where: { id: orderId, ...(admin ? {} : { userId }) } });
    if (!order) throw HttpError.notFound();
    const shipment = await OrderShipmentModel.findOne({
      where: { orderId, status: { [Op.notIn]: ['CANCELLED'] } },
      order: [['id', 'DESC']],
    });
    if (
      shipment?.mode === 'live' &&
      shipment.carrier === 'SUPERAI' &&
      shipment.trackingNumber &&
      !TERMINAL_SHIPMENT_STATUSES.includes(shipment.status) &&
      (!shipment.lastSyncedAt || Date.now() - shipment.lastSyncedAt.getTime() > 60_000)
    ) {
      await shipment.update({ lastSyncedAt: new Date() });
      try {
        const info = await SuperAi.orderInfo(shipment.trackingNumber);
        if (info.carrierCode && info.carrierCode !== shipment.carrierCode)
          await shipment.update({
            carrierCode: info.carrierCode,
            trackingUrl: SuperAi.carrierTrackingUrl(info.carrierId, info.carrierCode),
          });
        const status = SuperAi.mapSuperAiStatus(info.status);
        if (status && info.status !== shipment.carrierStatus)
          await this.recordEvent({
            shipmentId: shipment.id,
            status,
            reason: null,
            providerEventId: `superai-poll:${shipment.trackingNumber}:${info.status}:${info.updatedAt || ''}`,
            actorUserId: null,
            carrierStatus: info.status,
          });
      } catch (error) {
        Logger.WARN(`SuperAI tracking for ${shipment.trackingNumber} unavailable: ${(error as Error).message}`);
      }
    }
    return admin ? this.orders.getAdmin(orderId) : this.orders.getForUser(userId, orderId);
  }

  private async recordEvent(input: {
    shipmentId: number;
    status: ShipmentStatus;
    reason: string | null;
    providerEventId: string;
    actorUserId: number | null;
    carrierStatus?: string | null;
    details?: Record<string, unknown>;
  }) {
    let orderId = 0;
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      if (input.actorUserId) await this.admin(input.actorUserId, transaction);
      const shipment = await OrderShipmentModel.findByPk(input.shipmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!shipment) throw HttpError.notFound();
      orderId = shipment.orderId;
      if (await OrderShipmentEventModel.findOne({ where: { providerEventId: input.providerEventId }, transaction }))
        return; // repeated webhook
      // Staff follow the transition table; the carrier is believed unless the waybill is already final.
      const applied = input.actorUserId
        ? SHIPMENT_TRANSITIONS[shipment.status].includes(input.status)
        : !TERMINAL_SHIPMENT_STATUSES.includes(shipment.status) &&
          (shipment.status !== input.status || (input.carrierStatus ?? null) !== shipment.carrierStatus);
      if (!applied && input.actorUserId)
        throw HttpError.conflict(
          `A waybill in ${shipment.status} cannot become ${input.status}.`,
          'SHIPMENT_TRANSITION',
        );
      await OrderShipmentEventModel.create(
        {
          shipmentId: shipment.id,
          providerEventId: input.providerEventId,
          status: input.status,
          applied,
          reason: input.reason,
          actorUserId: input.actorUserId,
          carrierStatus: input.carrierStatus ?? null,
          details: input.details ?? {},
        },
        { transaction },
      );
      if (!applied) return;
      const changed = shipment.status !== input.status;
      await shipment.update(
        {
          status: input.status,
          carrierStatus: input.carrierStatus ?? shipment.carrierStatus,
          failureReason: input.status === 'DELIVERY_FAILED' ? input.reason : shipment.failureReason,
        },
        { transaction },
      );
      if (!changed) return;
      const order = await this.lockedOrder(shipment.orderId, transaction);
      const actor = input.actorUserId ?? order.userId;
      // The order follows the parcel: picked up = shipped, delivered = delivered (COD still awaits reconciliation).
      if (
        ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(input.status) &&
        order.status === 'PROCESSING'
      )
        await this.orders.changeStatus(order, 'SHIPPED', transaction, actor);
      if (input.status === 'DELIVERED' && order.status === 'SHIPPED')
        await this.orders.changeStatus(order, 'DELIVERED', transaction, actor);
      const kind = CUSTOMER_EVENT_KINDS[input.status];
      const facts = await this.fulfillment.facts(order, transaction);
      // What the customer tracks: the carrier's own code once it exists, else SuperAI's.
      const code = shipment.carrierCode || shipment.trackingNumber || '';
      const trackingUrl = shipment.trackingUrl || Messages.orderTrackingUrl(order.id);
      const carrierName = shipment.carrierName || shipment.carrier;
      if (input.status === 'DELIVERY_FAILED' || input.status === 'EXCEPTION') {
        const reason = input.reason || input.carrierStatus || 'Không rõ';
        await this.notices.alertAdmins(
          {
            kind: 'delivery_failed',
            orderId: order.id,
            dedupeKey: `shipment-event:${input.providerEventId}:admin`,
            ...Messages.adminDeliveryFailed(facts.orderCode, code, reason, order.id),
          },
          transaction,
        );
      }
      if (kind) {
        const statusText = Messages.shipmentStatusText(input.status);
        await this.notices.notifyCustomer(
          {
            userId: order.userId,
            kind,
            entityId: order.id,
            dedupeKey: `shipment-event:${input.providerEventId}`,
            details: {
              orderCode: facts.orderCode,
              carrierName,
              trackingNumber: code,
              trackingUrl,
              codAmountVnd: shipment.codAmountVnd,
              reason: input.reason,
            },
            email: EMAIL_STATUSES.includes(input.status)
              ? Messages.emailShipmentStatus(
                  facts.orderCode,
                  facts.customerName,
                  carrierName,
                  code,
                  statusText,
                  trackingUrl,
                  input.reason,
                )
              : null,
            zns: EMAIL_STATUSES.includes(input.status)
              ? {
                  phone: order.phone,
                  event: input.status,
                  orderCode: facts.orderCode,
                  trackingNumber: code,
                  statusText,
                }
              : null,
          },
          transaction,
        );
      }
    });
    this.notices.dispatchSoon();
    return this.orders.getAdmin(orderId);
  }
}
