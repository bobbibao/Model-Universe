import { Op, Transaction, UniqueConstraintError, col, fn, where } from 'sequelize';
import ReservationModel from '../database/client/models/Reservation.Model';
import ReservationPaymentModel from '../database/client/models/ReservationPayment.Model';
import ReservationEventModel from '../database/client/models/ReservationEvent.Model';
import ProductModel from '../database/client/models/Product.Model';
import OrderModel from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import UserModel from '../database/internal/models/User.Model';
import DatabaseProvider from '../database/Database.Provider';
import CartService from './CartService';
import OrderService from './OrderService';
import CommercePolicyService from './CommercePolicyService';
import EvidenceService from './EvidenceService';
import MoneyReferenceService from './MoneyReferenceService';
import CommerceNotificationModel from '../database/client/models/CommerceNotification.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { reservationDeadline } from '../../../shared/reservation';

const integer = (value: unknown, label: string, minimum = 1): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw HttpError.badRequest(`Invalid ${label}.`);
  return value;
};
const reference = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_./-]{8,128}$/.test(value)) throw HttpError.badRequest('An 8–128 character transaction reference is required.');
  return value.trim().toUpperCase();
};
const reason = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw HttpError.badRequest('A recorded reason is required.');
  return value.trim();
};
const expired = (row: ReservationModel, now = new Date()): boolean =>
  row.paidVnd < row.totalVnd && !!row.expiresAt && now > row.expiresAt && ['holding', 'delivery_requested', 'expired'].includes(row.status);

export default class ReservationService {
  private policies = new CommercePolicyService();
  private orders = new OrderService();

  private async admin(actorUserId: number, transaction: Transaction) {
    const actor = await UserModel.findByPk(actorUserId, { transaction });
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
  }
  private async locked(id: number, transaction: Transaction, userId?: number) {
    integer(id, 'reservation');
    const row = await ReservationModel.findOne({ where: { id, ...(userId !== undefined ? { userId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw HttpError.notFound('Reservation not found.');
    return row;
  }
  private audit(row: ReservationModel, actorUserId: number, action: string, note: string, transaction: Transaction, details: Record<string, unknown> = {}) {
    return ReservationEventModel.create({ reservationId: row.id, actorUserId, action, reason: note, details }, { transaction });
  }
  private view(row: ReservationModel) {
    return { ...row.get({ plain: true }), status: expired(row) ? 'expired' : row.status, remainingVnd: row.totalVnd - row.paidVnd, minimumInitialVnd: Math.ceil(row.totalVnd / 2) };
  }
  async list(userId?: number) {
    const rows = await ReservationModel.findAll({ where: userId === undefined ? {} : { userId }, order: [['id', 'DESC']], limit: 100 });
    return rows.map(row => this.view(row));
  }
  async detail(id: number, userId?: number) {
    integer(id, 'reservation');
    const row = await ReservationModel.findOne({ where: { id, ...(userId !== undefined ? { userId } : {}) } });
    if (!row) throw HttpError.notFound('Reservation not found.');
    const [payments, events] = await Promise.all([
      ReservationPaymentModel.findAll({ where: { reservationId: id }, order: [['id', 'ASC']] }),
      ReservationEventModel.findAll({ where: { reservationId: id }, order: [['id', 'ASC']] }),
    ]);
    const evidence = await new EvidenceService().list(row.userId, 'reservation_payment', id);
    const refundedVnd = payments.filter(payment => payment.kind === 'refund').reduce((sum,payment) => sum + payment.amountVnd,0);
    const forfeitedVnd = payments.filter(payment => payment.kind === 'forfeit').reduce((sum,payment) => sum + payment.amountVnd,0);
    return { ...this.view(row), payments, events, evidence, refundedVnd, forfeitedVnd, unresolvedDepositVnd: row.status === 'cancelled' ? row.paidVnd - refundedVnd - forfeitedVnd : 0 };
  }
  async attachEvidence(id: number, userId: number, ids: unknown) {
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, transaction, userId);
      if (['cancelled','completed'].includes(row.status)) throw HttpError.conflict('This reservation no longer accepts payment evidence.');
      const evidence = await new EvidenceService().bind(ids, userId, 'reservation_payment', id, transaction);
      await this.audit(row, userId, 'evidence_submitted', 'Payment evidence submitted for staff verification; no funds confirmed.', transaction, { evidence });
    });
    return this.detail(id, userId);
  }
  async notifications(userId: number) {
    return CommerceNotificationModel.findAll({ where: { userId, kind: 'reservation_deadline' }, order: [['id','DESC']], limit: 50 });
  }
  async create(userId: number, data: Record<string, unknown>) {
    const productId = integer(data.productId, 'product');
    const quantity = integer(data.quantity, 'quantity');
    if (quantity > 100) throw HttpError.badRequest('Reservation quantity is too large.');
    const key = reference(data.requestKey);
    const policy = await this.policies.approved('reservation');
    const assertReplay = (row: ReservationModel) => {
      if (row.productId !== productId || row.quantity !== quantity) throw HttpError.conflict('The request reference belongs to a different reservation.');
      return this.view(row);
    };
    const existing = await ReservationModel.findOne({ where: { userId, requestKey: key } });
    if (existing) return assertReplay(existing);
    try {
      return await DatabaseProvider.getInstance().transaction(async transaction => {
        const { lines, products } = await new CartService().resolveLines([{ productId, quantity, size: '' }], { transaction, lock: true });
        const line = lines[0];
        if (line?.status !== 'OK') throw HttpError.conflict('The model is no longer available.');
        if (!Number.isSafeInteger(line.lineTotal) || line.lineTotal < 1 || line.lineTotal > 2147483647) throw HttpError.badRequest('The reservation amount exceeds the supported integer VND range.');
        if (data.expectedTotal !== line.lineTotal) throw HttpError.conflict('The price changed. Review the latest quote.','PRICE_CHANGED');
        const product = products.get(productId) as ProductModel;
        if (product.partnerId) throw HttpError.conflict('Collector reservations apply to shop-owned models.');
        if (!product.grade) throw HttpError.badRequest('Only verified model listings can be reserved.');
        const row = await ReservationModel.create({ userId, productId, quantity, productName: product.name, imageUrl: product.imageUrl, unitPriceVnd: line.product?.salePrice, totalVnd: line.lineTotal, requestKey: key, policyVersion: policy.version,
          modelSnapshot: { sku: product.sku, grade: product.grade, scale: product.scale, series: product.series, modelCode: product.modelCode, condition: product.condition, assemblyState: product.assemblyState, boxCondition: product.boxCondition, includedAccessories: product.includedAccessories, defects: product.defects } }, { transaction });
        await this.audit(row, userId, 'requested', 'Customer accepted the model and locked merchandise quote.', transaction);
        return this.view(row);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const replay = await ReservationModel.findOne({ where: { userId, requestKey: key } });
        if (replay) return assertReplay(replay);
      }
      throw error;
    }
  }
  async confirmPayment(id: number, actorUserId: number, data: Record<string, unknown>) {
    const amountVnd = integer(data.amountVnd, 'confirmed payment');
    const externalReference = reference(data.externalReference);
    const note = reason(data.reason);
    if (data.moneyVerified !== true) throw HttpError.badRequest('Verify receipt of funds before confirming payment.');
    const assertReplay = (payment: ReservationPaymentModel) => {
      if (payment.reservationId !== id || payment.amountVnd !== amountVnd || payment.kind !== 'receipt') throw HttpError.conflict('This bank reference has already been allocated elsewhere.','PAYMENT_REFERENCE_REUSED');
    };
    try {
      await DatabaseProvider.getInstance().transaction(async transaction => {
        await this.admin(actorUserId, transaction);
        await MoneyReferenceService.lock(externalReference, 'reservation_payment', transaction);
        const row = await this.locked(id, transaction);
        const replay = await ReservationPaymentModel.findOne({ where: where(fn('UPPER', col('externalReference')), externalReference), transaction });
        if (replay) { assertReplay(replay); return; }
        if (!['awaiting_payment', 'holding', 'delivery_requested'].includes(row.status) || expired(row)) throw HttpError.conflict('The reservation cannot accept another payment.','RESERVATION_INACTIVE');
        if (row.paidVnd + amountVnd > row.totalVnd || (row.paidVnd === 0 && amountVnd < Math.ceil(row.totalVnd / 2))) throw HttpError.badRequest('Payment must reach at least 50% initially and cannot exceed the balance.',undefined,'RESERVATION_PAYMENT_INVALID');
        if (!row.inventoryAllocated) {
          const product = await ProductModel.findByPk(row.productId, { transaction, lock: transaction.LOCK.UPDATE });
          if (!product || product.partnerId || product.isArchived || product.inventoryStatus !== 'available' || product.stock < row.quantity) throw HttpError.conflict('The model sold before its deposit was confirmed. Reconcile the received money manually.');
          await product.update({ stock: product.stock - row.quantity }, { transaction });
        }
        const now = new Date();
        const paidVnd = row.paidVnd + amountVnd;
        const startedAt = row.startedAt || now;
        await ReservationPaymentModel.create({ reservationId: id, confirmedByUserId: actorUserId, amountVnd, externalReference, reason: note }, { transaction });
        await row.update({ paidVnd, startedAt, expiresAt: reservationDeadline(startedAt, row.totalVnd, paidVnd, row.extensionDays), inventoryAllocated: true,
          status: row.status === 'delivery_requested' ? 'delivery_requested' : paidVnd === row.totalVnd ? 'fully_paid' : 'holding' }, { transaction });
        await this.audit(row, actorUserId, 'payment_confirmed', note, transaction, { amountVnd, externalReference });
      });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const replay = await ReservationPaymentModel.findOne({ where: where(fn('UPPER', col('externalReference')), externalReference) });
      if (!replay) throw error;
      assertReplay(replay);
    }
    return this.detail(id);
  }
  async requestDelivery(id: number, userId: number, data: Record<string, unknown>) {
    const deliveryMethod = data.deliveryMethod;
    if (!['delivery', 'pickup'].includes(String(deliveryMethod))) throw HttpError.badRequest('Choose delivery or pickup.');
    // Pickup still records verified recipient contact; store address is not invented as a shipping destination.
    const shipping = this.orders.validateShipping((data.shipping as Record<string, unknown>) || {});
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, transaction, userId);
      if (!['holding', 'fully_paid', 'delivery_requested'].includes(row.status) || expired(row)) throw HttpError.conflict('Delivery can only be requested during an active hold or after full payment.');
      await row.update({ status: 'delivery_requested', shipping, deliveryMethod }, { transaction });
      await this.audit(row, userId, 'delivery_requested', 'Customer requested fulfillment; COD is limited to the unpaid balance.', transaction, { deliveryMethod, remainingVnd: row.totalVnd - row.paidVnd });
    });
    return this.detail(id, userId);
  }
  async cancelDeliveryRequest(id: number, userId: number) {
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const row = await this.locked(id, transaction, userId);
      if (row.status !== 'delivery_requested') throw HttpError.conflict('No unconfirmed delivery request can be cancelled.');
      const status = row.paidVnd === row.totalVnd ? 'fully_paid' : expired(row) ? 'expired' : 'holding';
      await row.update({ status, shipping: null, deliveryMethod: null }, { transaction });
      await this.audit(row, userId, 'delivery_request_cancelled', 'Customer cancelled the unconfirmed fulfillment request.', transaction);
    });
    return this.detail(id, userId);
  }
  async confirmDelivery(id: number, actorUserId: number) {
    await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.admin(actorUserId, transaction);
      const row = await this.locked(id, transaction);
      if (row.orderId) return;
      if (row.status !== 'delivery_requested' || expired(row) || !row.inventoryAllocated || !row.shipping) throw HttpError.conflict('The delivery request is not eligible for confirmation.');
      const product = await ProductModel.findByPk(row.productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product) throw HttpError.notFound('Reserved model not found.');
      const shipping = this.orders.validateShipping(row.shipping);
      const order = await OrderModel.create({ ...shipping, userId: row.userId, status: 'PROCESSING', paymentMethod: 'COD', paymentStatus: row.paidVnd === row.totalVnd ? 'PAID' : 'PENDING', requiresCollectionConfirmation:true, subtotal: row.totalVnd, total: row.totalVnd, prepaidVnd: row.paidVnd, paymentSource: row.paidVnd === row.totalVnd ? 'BANK_TRANSFER' : 'TRANSFER_PLUS_COD', note: `${shipping.note || ''}\nReservation #${id}; ${row.deliveryMethod}; COD balance ${row.totalVnd - row.paidVnd} VND.`.trim() }, { transaction });
      await OrderItemModel.create({ orderId: order.id, productId: row.productId, productName: row.productName, imageUrl: row.imageUrl, size: '', quantity: row.quantity, unitPrice: row.unitPriceVnd, modelSnapshot: row.modelSnapshot }, { transaction });
      await product.increment('sold', { by: row.quantity, transaction });
      await row.update({ status: 'fulfilling', orderId: order.id }, { transaction });
      await this.audit(row, actorUserId, 'fulfillment_confirmed', 'Shop confirmed fulfillment and stopped expiry; stock allocation transferred to order.', transaction, { orderId: order.id, codDueVnd: row.totalVnd - row.paidVnd });
    });
    return this.detail(id);
  }
  async extend(id: number, actorUserId: number, data: Record<string, unknown>) {
    const days = integer(data.days, 'extension days');
    if (days > 365) throw HttpError.badRequest('Extension exceeds one year.');
    const note = reason(data.reason);
    await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.admin(actorUserId, transaction);
      const row = await this.locked(id, transaction);
      if (!row.startedAt || !['holding', 'expired', 'delivery_requested'].includes(row.status) || row.paidVnd === row.totalVnd) throw HttpError.conflict('Only unpaid allocated holds can be extended.');
      const extensionDays = row.extensionDays + days;
      const expiresAt = reservationDeadline(row.startedAt, row.totalVnd, row.paidVnd, extensionDays);
      await row.update({ extensionDays, expiresAt, status: expiresAt < new Date() ? 'expired' : row.status === 'delivery_requested' ? 'delivery_requested' : 'holding' }, { transaction });
      await this.audit(row, actorUserId, 'extended', note, transaction, { days, expiresAt });
    });
    return this.detail(id);
  }
  async cancel(id: number, actorUserId: number, data: Record<string, unknown>, customer = false) {
    const note = reason(data.reason);
    await DatabaseProvider.getInstance().transaction(async transaction => {
      if (!customer) await this.admin(actorUserId, transaction);
      const row = await this.locked(id, transaction, customer ? actorUserId : undefined);
      if (row.status === 'cancelled') return;
      if (['fulfilling', 'completed'].includes(row.status) || row.orderId) throw HttpError.conflict('Manage the linked order before cancelling its reservation.');
      if (customer && row.paidVnd === row.totalVnd) throw HttpError.conflict('Contact staff to reconcile a fully paid reservation.');
      if (customer && row.paidVnd > 0 && data.acknowledgeForfeiture !== true) throw HttpError.badRequest('Acknowledge the cancellation deposit policy before proceeding.');
      if (row.inventoryAllocated) {
        const product = await ProductModel.findByPk(row.productId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!product) throw HttpError.notFound('Reserved model not found.');
        await product.increment('stock', { by: row.quantity, transaction });
      }
      await row.update({ status: 'cancelled', inventoryAllocated: false }, { transaction });
      await this.audit(row, actorUserId, 'cancelled', note, transaction, { depositVnd: row.paidVnd, depositDisposition: 'pending_staff_reconciliation' });
    });
    return this.detail(id, customer ? actorUserId : undefined);
  }
  async confirmRefund(id: number, actorUserId: number, data: Record<string, unknown>) {
    return this.reconcileDeposit(id, actorUserId, data, 'refund');
  }
  async confirmForfeit(id: number, actorUserId: number, data: Record<string, unknown>) {
    return this.reconcileDeposit(id, actorUserId, data, 'forfeit');
  }
  private async reconcileDeposit(id: number, actorUserId: number, data: Record<string, unknown>, kind: 'refund' | 'forfeit') {
    const amountVnd = integer(data.amountVnd, 'refund');
    const externalReference = reference(data.externalReference);
    const note = reason(data.reason);
    if (kind === 'refund' && (data.moneyVerified !== true || data.exceptionReason !== 'shop_fault')) throw HttpError.badRequest('A documented shop-fault exception and verified executed refund are required.');
    if (kind === 'forfeit' && !['customer_cancel','expired_hold'].includes(String(data.forfeitReason))) throw HttpError.badRequest('Record the source-policy forfeiture reason.');
    const assertReplay = (payment: ReservationPaymentModel) => {
      if (payment.reservationId !== id || payment.amountVnd !== amountVnd || payment.kind !== kind) throw HttpError.conflict('This reconciliation reference is already in use.');
    };
    try {
      await DatabaseProvider.getInstance().transaction(async transaction => {
      await this.admin(actorUserId, transaction);
      if (kind === 'refund') await MoneyReferenceService.lock(externalReference, 'reservation_payment', transaction);
      const row = await this.locked(id, transaction);
      const replay = await ReservationPaymentModel.findOne({ where: where(fn('UPPER', col('externalReference')), externalReference), transaction });
      if (replay) { assertReplay(replay); return; }
      if (row.status !== 'cancelled') throw HttpError.conflict('Reconcile refunds only after cancellation.');
      const reconciled = Number(await ReservationPaymentModel.sum('amountVnd', { where: { reservationId: id, kind: { [Op.in]: ['refund','forfeit'] } }, transaction }) || 0);
      if (amountVnd > row.paidVnd - reconciled) throw HttpError.badRequest('Reconciliation exceeds the remaining deposit liability.');
      await ReservationPaymentModel.create({ reservationId: id, confirmedByUserId: actorUserId, amountVnd, externalReference, kind, reason: note }, { transaction });
      await this.audit(row, actorUserId, `${kind}_confirmed`, note, transaction, { amountVnd, externalReference, sourceReason: kind === 'refund' ? data.exceptionReason : data.forfeitReason });
    });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const replay = await ReservationPaymentModel.findOne({ where: where(fn('UPPER', col('externalReference')), externalReference) });
      if (!replay) throw error;
      assertReplay(replay);
    }
    return this.detail(id);
  }
  async expiryQueue() {
    const rows = await ReservationModel.findAll({ where: { status: { [Op.in]: ['holding', 'delivery_requested', 'expired'] }, expiresAt: { [Op.lt]: new Date() } }, order: [['expiresAt', 'ASC']], limit: 100 });
    return rows.filter(row => expired(row)).map(row => this.view(row));
  }
}
