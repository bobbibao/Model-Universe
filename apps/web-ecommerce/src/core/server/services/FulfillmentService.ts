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
import type { PackagePlanSnapshot } from '../../../shared/packing/plan';
import { transferMemo } from '../../../shared/payment';
import OrderService, { validateMeetingRequest } from './OrderService';
import NotificationDispatchService from './NotificationDispatchService';
import FulfillmentNotices from './delivery/FulfillmentNotices';
import * as Messages from './delivery/Messages';
import * as SuperAi from './delivery/SuperAiClient';
import ShippingService from './ShippingService';
import OrderPackagePlanModel from '../database/client/models/OrderPackagePlan.Model';
import { splitVnd } from '../../../shared/packing/cod';
import { parcelCodVnd, withOrderItems } from '../../../shared/packing/plan';
import PackagePlanService from './PackagePlanService';
import { SUPERAI_CARRIERS } from '../../../shared/packing/rules';
import Logger from '../../../shared/server/utils/logger';

const whole = (value: unknown, field: string, min = 0, max = 2_000_000_000) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw HttpError.badRequest(`Provide ${field} as a whole number.`);
  return value;
};

// The order's goods after discounts: its total without the shipping fee the customer pays.
const goodsValueVnd = (order: OrderModel) =>
  Math.max(0, order.total - (order.shippingFee || 0) + (order.shippingDiscountVnd || 0));

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
      // The customer comes to the shop: only the day and time change.
      const address = order.address,
        city = order.city;
      const showroom = await this.shipping.showroom();
      const changeRequest = validateMeetingRequest(data, { address, city }, showroom?.leadHours ?? undefined);
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
    if (!(await this.missingParcels(orderId)).length) return null;
    try {
      // A planned order ships every parcel of its plan; an order from before the package optimizer one default box.
      if (await this.currentPlan(orderId))
        return await this.createMissingShipments(null, orderId, { requestKey: `auto-${orderId}-${order.prepaidVnd}` });
      return await this.createShipment(null, orderId, {
        requestKey: `auto-${orderId}-${order.prepaidVnd}`,
        package: await this.suggestPackage(orderId),
      });
    } catch (error) {
      Logger.WARN(`Automatic SuperAI order for ${orderId} failed: ${(error as Error).message}`);
      return null;
    }
  }

  // The order's package plan in force (the newest version not superseded), or null for orders planned before the
  // package optimizer.
  async currentPlan(orderId: number, transaction?: Transaction) {
    const row = await OrderPackagePlanModel.findOne({
      where: { orderId, status: { [Op.ne]: 'SUPERSEDED' } },
      order: [['version', 'DESC']],
      transaction,
    });
    return row?.plan ? row : null;
  }

  // The parcels of the order that have no active waybill yet (1-based indexes).
  async missingParcels(orderId: number, transaction?: Transaction) {
    const plan = await this.currentPlan(orderId, transaction);
    const count = plan?.plan?.parcels.length ?? 1;
    const active = await OrderShipmentModel.findAll({
      where: { orderId, status: { [Op.in]: [...ACTIVE_SHIPMENT_STATUSES] } },
      attributes: ['parcelIndex'],
      transaction,
    });
    return Array.from({ length: count }, (_, i) => i + 1).filter(
      (index) => !active.some((row) => row.parcelIndex === index),
    );
  }

  // The order's package plan for staff: the version in force, its history, which parcels still need a waybill.
  async packagePlan(orderId: number) {
    const order = await OrderModel.findByPk(orderId);
    if (!order) throw HttpError.notFound();
    const versions = await new PackagePlanService().versions(orderId);
    const current = versions.find((row) => row.status !== 'SUPERSEDED') ?? null;
    return {
      current,
      history: versions.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        totalFeeVnd: row.plan?.carrierFeeVnd ?? null,
        parcels: row.plan?.parcels.length ?? 0,
        createdByUserId: row.createdByUserId,
        createdAt: row.get('createdAt'),
        note: row.note,
      })),
      missingParcels: await this.missingParcels(orderId),
      chargedFeeVnd: order.shippingFee,
    };
  }

  // Staff revise the package plan before any parcel has a waybill: a fresh optimizer run (after product packing sizes
  // or cartons changed), or one of the alternatives the previous run weighed. What the customer paid never changes.
  async replanPackages(actorUserId: number, orderId: number, data: Record<string, unknown>) {
    const plans = new PackagePlanService();
    const order = await OrderModel.findByPk(orderId);
    if (!order) throw HttpError.notFound();
    if (order.fulfillmentMethod !== 'COURIER_COD' || order.status !== 'PROCESSING')
      throw HttpError.conflict('Only courier orders still being prepared can be re-planned.', 'PLAN_LOCKED');
    if (await OrderShipmentModel.count({ where: { orderId, status: { [Op.in]: [...ACTIVE_SHIPMENT_STATUSES] } } }))
      throw HttpError.conflict("Cancel the parcels' waybills before changing how the order is packed.", 'PLAN_IN_USE');
    const current = await this.currentPlan(orderId);
    const items = await OrderItemModel.findAll({ where: { orderId }, order: [['id', 'ASC']] });
    let next: { plan: PackagePlanSnapshot; alternatives: PackagePlanSnapshot[]; estimatedProductIds: number[] };
    if (data.alternative !== undefined) {
      const index = whole(data.alternative, 'the alternative', 0, 10);
      const chosen = current?.alternatives[index];
      if (!current?.plan || !chosen) throw HttpError.notFound('This alternative is not available.');
      next = {
        plan: chosen,
        alternatives: [current.plan, ...current.alternatives.filter((_, i) => i !== index)],
        estimatedProductIds: current.estimatedProductIds,
      };
    } else {
      const products = new Map(
        (await ProductModel.findAll({ where: { id: items.map((item) => item.productId) } })).map((row) => [
          row.id,
          row,
        ]),
      );
      const quote = await plans.quote(
        items.map((item) => ({
          productId: item.productId,
          name: item.productName,
          quantity: item.quantity,
          lineTotalVnd: item.unitPrice * item.quantity,
          product: {
            packaging: products.get(item.productId)?.packaging ?? null,
            grade: products.get(item.productId)?.grade ?? null,
          },
        })),
        { origin: await this.shipping.origin(), address: this.deliveryAddress(order) },
      );
      const ids = items.map((item) => item.id);
      next = {
        plan: withOrderItems(quote.quote.plan!, ids),
        alternatives: quote.alternatives.map((plan) => withOrderItems(plan, ids)),
        estimatedProductIds: quote.estimatedProductIds,
      };
    }
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.admin(actorUserId, transaction);
      await plans.saveVersion(
        orderId,
        {
          ...next,
          chargedFeeVnd: order.shippingFee,
          createdByUserId: actorUserId,
          note: asTrimmedString(data.note).slice(0, 500) || null,
          expectedVersion: data.expectedVersion,
        },
        transaction,
      );
    });
    return this.packagePlan(orderId);
  }

  // One waybill for every parcel of the plan that has none yet. Each parcel has its own request key, so a retry only
  // creates what is missing; a parcel the carrier refuses does not stop the others (the first error is reported).
  async createMissingShipments(actorUserId: number | null, orderId: number, data: Record<string, unknown>) {
    const base = asTrimmedString(data.requestKey);
    if (!/^[A-Za-z0-9:_-]{8,120}$/.test(base)) throw HttpError.badRequest('Invalid waybill request reference.');
    let firstError: unknown = null;
    for (const parcelIndex of await this.missingParcels(orderId)) {
      try {
        await this.createShipment(actorUserId, orderId, {
          ...data,
          requestKey: `${base}-p${parcelIndex}`,
          parcelIndex,
        });
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
    return this.orders.getAdmin(orderId);
  }

  // Every pre-waybill check of the specification (§18); a failed check creates no waybill. `actorUserId` null: the
  // automatic creation after a verified payment. The carrier is the one checkout chose (the cheapest quote then);
  // staff may pick another one (`carrierId`).
  async createShipment(actorUserId: number | null, orderId: number, data: Record<string, unknown>) {
    const requestKey = asTrimmedString(data.requestKey);
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(requestKey)) throw HttpError.badRequest('Invalid waybill request reference.');
    const parcelIndex = data.parcelIndex === undefined ? 1 : whole(data.parcelIndex, 'the parcel number', 1, 10);
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
        // The parcel of the package plan this waybill carries (orders from before the optimizer: one parcel).
        const planRow = await this.currentPlan(orderId, transaction);
        const plan = planRow?.plan ?? null;
        const parcel = plan ? plan.parcels.find((row) => row.index === parcelIndex) : null;
        if ((plan && !parcel) || (!plan && parcelIndex !== 1))
          throw HttpError.badRequest('This order has no such parcel.', undefined, 'PARCEL_UNKNOWN');
        const parcelCount = plan ? plan.parcels.length : 1;
        const activeRows = await OrderShipmentModel.findAll({
          where: { orderId, status: { [Op.in]: [...ACTIVE_SHIPMENT_STATUSES] } },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (activeRows.some((row) => row.parcelIndex === parcelIndex))
          throw HttpError.conflict(
            parcelCount > 1
              ? `Parcel ${parcelIndex} of this delivery already has an active waybill.`
              : 'This delivery already has an active waybill.',
            'WAYBILL_EXISTS',
          );
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
        // A parcel declares its share of the goods value and collects its share of the COD (by goods value). The
        // last parcel to get a waybill collects whatever the others do not, so the parts always add up.
        const orderCod = remainingProductVnd(order.total, order.prepaidVnd);
        let declaredValueVnd = goodsValueVnd(order);
        let cod = orderCod;
        if (plan && parcel && parcelCount > 1) {
          declaredValueVnd = splitVnd(
            declaredValueVnd,
            plan.parcels.map((row) => row.goodsValueVnd),
          )[parcelIndex - 1];
          const collectedElsewhere = activeRows.reduce((sum, row) => sum + row.codAmountVnd, 0);
          const remaining = Math.max(0, orderCod - collectedElsewhere);
          const lastMissing = activeRows.length === parcelCount - 1;
          cod = lastMissing ? remaining : Math.min(remaining, parcelCodVnd(plan, orderCod)[parcelIndex - 1]);
        }
        // Staff may enter the package they measured; otherwise the plan's parcel (or, without a plan, the request).
        const spec: PackageSpec =
          parcel && data.package === undefined
            ? {
                weightGram: parcel.actualWeightGram,
                lengthCm: parcel.outerCm[0],
                widthCm: parcel.outerCm[1],
                heightCm: parcel.outerCm[2],
                fragile: true,
                declaredValueVnd,
                note:
                  parcelCount > 1
                    ? `Kiện ${parcelIndex}/${parcelCount} · thùng ${parcel.cartonCode}`
                    : `Thùng ${parcel.cartonCode}`,
              }
            : this.packageSpec(data.package, declaredValueVnd);
        // What SuperAI is told the parcel weighs: the planned billable weight (with the carrier's own divisor), or the
        // billable weight of the package staff measured.
        const weightGram = parcel && data.package === undefined ? parcel.billableWeightGram : billableWeightGram(spec);
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
        // A revised package plan may have chosen another carrier.
        if (plan?.carrierId && carrier?.carrierId !== plan.carrierId)
          carrier = order.shippingQuote?.options.find((option) => option.carrierId === plan.carrierId) ?? {
            carrierId: plan.carrierId,
            carrierName: SUPERAI_CARRIERS[String(plan.carrierId)] ?? 'SuperAI',
            shipmentFeeVnd: 0,
            insuranceFeeVnd: 0,
            feeVnd: 0,
            estimatedPickup: null,
            estimatedDelivery: null,
          };
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
        // The shop's own order code (SuperAI `soc`), per parcel when there are several; a second waybill after a
        // cancellation gets a suffix.
        const previous = await OrderShipmentModel.count({ where: { orderId, parcelIndex }, transaction });
        const socBase = parcelCount > 1 ? `MU${orderId}-K${parcelIndex}` : `MU${orderId}`;
        const soc = previous ? `${socBase}-${previous + 1}` : socBase;
        const parcelItems = parcel
          ? parcel.items
              .map((row) => ({ item: items.find((item) => item.id === row.orderItemId), quantity: row.quantity }))
              .filter((row): row is { item: OrderItemModel; quantity: number } => !!row.item)
          : items.map((item) => ({ item, quantity: item.quantity }));
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
              valueVnd: declaredValueVnd,
              weightGram,
              soc,
              note: [order.note, spec.fragile ? 'Hàng dễ vỡ, xin nhẹ tay.' : null, spec.note].filter(Boolean).join(' '),
              config: origin!.viewConfig,
              products: parcelItems.map(({ item, quantity }) => ({
                sku: String(item.productId),
                name: item.productName,
                price: item.unitPrice,
                weight: Math.max(1, Math.round(weightGram / Math.max(1, parcelItems.length))),
                quantity,
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
            // A planned parcel was priced on its own at checkout (insurance included).
            feeVnd: parcel ? parcel.feeVnd : (carrier?.shipmentFeeVnd ?? estimateShippingFeeVnd(spec)),
            insuranceVnd: parcel ? 0 : (carrier?.insuranceFeeVnd ?? 0),
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
            packagePlanId: planRow?.id ?? null,
            parcelIndex,
            parcelCount,
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
    await this.weightDiscrepancy(shipment, Number(body.weight));
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
    // Every parcel still moving (an order may ship several).
    const shipments = await OrderShipmentModel.findAll({
      where: { orderId, status: { [Op.notIn]: ['CANCELLED'] } },
      order: [['id', 'DESC']],
    });
    for (const shipment of shipments) {
      if (
        shipment.mode !== 'live' ||
        shipment.carrier !== 'SUPERAI' ||
        !shipment.trackingNumber ||
        TERMINAL_SHIPMENT_STATUSES.includes(shipment.status) ||
        (shipment.lastSyncedAt && Date.now() - shipment.lastSyncedAt.getTime() <= 60_000)
      )
        continue;
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

  // The carrier re-weighs every parcel: a billable weight more than 10% above what was booked costs the shop a
  // surcharge and usually means a product's packing size is wrong, so staff are told which products to measure.
  private async weightDiscrepancy(shipment: OrderShipmentModel, carrierWeightGram: number) {
    if (!Number.isFinite(carrierWeightGram) || carrierWeightGram <= 0) return;
    const booked = billableWeightGram(shipment.packageSnapshot);
    const planRow = shipment.packagePlanId ? await OrderPackagePlanModel.findByPk(shipment.packagePlanId) : null;
    const planned =
      planRow?.plan?.parcels.find((parcel) => parcel.index === shipment.parcelIndex)?.billableWeightGram ?? booked;
    if (carrierWeightGram <= planned * 1.1) return;
    const products = planRow?.plan?.parcels
      .find((parcel) => parcel.index === shipment.parcelIndex)
      ?.items.map((item) => item.name)
      .join(', ');
    await this.notices.alertAdmins({
      kind: 'pack_discrepancy',
      orderId: shipment.orderId,
      dedupeKey: `shipment:${shipment.id}:weight:${carrierWeightGram}`,
      ...Messages.adminPackDiscrepancy(
        transferMemo(shipment.orderId),
        `Kiện ${shipment.parcelIndex}/${shipment.parcelCount}`,
        carrierWeightGram,
        planned,
        products || 'các sản phẩm trong kiện',
        shipment.orderId,
      ),
    });
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
      // Delivered only once every parcel of the order is delivered.
      if (input.status === 'DELIVERED' && order.status === 'SHIPPED') {
        const parcels = await OrderShipmentModel.findAll({
          where: { orderId: order.id, status: { [Op.notIn]: ['CANCELLED'] } },
          order: [['id', 'ASC']],
          transaction,
        });
        // The latest waybill of each parcel decides.
        const latest = new Map(parcels.map((row) => [row.parcelIndex, row]));
        if ([...latest.values()].every((row) => row.status === 'DELIVERED'))
          await this.orders.changeStatus(order, 'DELIVERED', transaction, actor);
      }
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
