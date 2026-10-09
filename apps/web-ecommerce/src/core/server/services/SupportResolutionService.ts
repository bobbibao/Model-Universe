import { Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import ReturnRequestModel from '../database/client/models/ReturnRequest.Model';
import ReturnItemModel from '../database/client/models/ReturnItem.Model';
import ReturnEventModel from '../database/client/models/ReturnEvent.Model';
import OrderModel from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import EvidenceService from './EvidenceService';
import LoyaltyService from './LoyaltyService';
import MoneyReferenceService from './MoneyReferenceService';
import HttpError from '../../../shared/server/utils/HttpError';
import { SUPPORT_OUTCOMES, type SupportOutcome } from '../../../shared/return-rules';
import type { SupportTerms } from '../../../shared/types/support';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import OrderRefundModel from '../database/client/models/OrderRefund.Model';
import { allocateVnd } from '../../../shared/money-allocation';

const physical = new Set<SupportOutcome>(['parts', 'exchange', 'repair']);
const text = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000)
    throw HttpError.badRequest('Provide the actual resolution details, at most 1,000 characters.');
  return value.trim();
};

export default class SupportResolutionService {
  private async actor(id: number, admin: boolean, transaction?: Transaction) {
    const user = await UserModel.findByPk(id, { transaction });
    if (!user?.isActive || (admin && user.role !== 'ADMIN')) throw HttpError.forbidden();
  }
  private async locked(id: number, version: unknown, transaction: Transaction, userId?: number) {
    const initial = await ReturnRequestModel.findOne({ where: { id, ...(userId ? { userId } : {}) }, transaction });
    if (!initial) throw HttpError.notFound();
    const order = await OrderModel.findByPk(initial.orderId, { transaction, lock: transaction.LOCK.UPDATE });
    const request = await ReturnRequestModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!request || !order) throw HttpError.notFound();
    if (request.resolutionVersion !== version)
      throw HttpError.conflict('The offer changed. Review its current terms before acting.');
    return { request, order };
  }
  async detail(id: number, userId: number, admin = false) {
    await this.actor(userId, admin);
    const request = await ReturnRequestModel.findOne({ where: { id, ...(admin ? {} : { userId }) } });
    if (!request) throw HttpError.notFound();
    return {
      ...request.get({ plain: true }),
      evidence: await new EvidenceService().list(request.userId, 'return', id),
      events: await ReturnEventModel.findAll({ where: { returnRequestId: id }, order: [['id', 'ASC']] }),
    };
  }
  async offer(id: number, actorUserId: number, data: Record<string, unknown>) {
    const outcome = data.outcome as SupportOutcome,
      details = text(data.details);
    if (!SUPPORT_OUTCOMES.includes(outcome)) throw HttpError.badRequest('Choose a supported resolution.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.actor(actorUserId, true, transaction);
      const { request, order } = await this.locked(id, data.expectedVersion, transaction);
      if (request.status === 'REJECTED' || ['accepted', 'resolved'].includes(request.resolutionStatus || ''))
        throw HttpError.conflict('An accepted or resolved agreement cannot be replaced.');
      const refundVnd = physical.has(outcome) ? 0 : data.refundVnd;
      if (
        typeof refundVnd !== 'number' ||
        !Number.isSafeInteger(refundVnd) ||
        refundVnd < (physical.has(outcome) ? 0 : 1) ||
        refundVnd > order.subtotal - order.discount
      )
        throw HttpError.badRequest('Enter an eligible net merchandise refund amount.');
      if (!physical.has(outcome) && order.paymentStatus !== 'PAID')
        throw HttpError.conflict('Verify the original sales collection before offering a refund.');
      if (outcome === 'full_refund') {
        const [lines, returns] = await Promise.all([
          OrderItemModel.findAll({ where: { orderId: order.id }, transaction }),
          ReturnItemModel.findAll({ where: { returnRequestId: id }, transaction }),
        ]);
        if (
          refundVnd !== order.subtotal - order.discount ||
          lines.some((line) => returns.find((item) => item.orderItemId === line.id)?.quantity !== line.quantity)
        )
          throw HttpError.badRequest(
            'A full order refund must cover all original lines and the complete net merchandise value.',
          );
      }
      let replacement: SupportTerms['replacement'] = null;
      if (outcome === 'parts' || outcome === 'exchange') {
        const quantity = data.quantity;
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 999)
          throw HttpError.badRequest('Enter the actual replacement quantity.');
        const product = await ProductModel.findByPk(Number(data.productId), { transaction });
        if (!product || !isSellable(product) || product.stock < quantity)
          throw HttpError.conflict('Choose an available actual replacement SKU.');
        replacement = {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl,
          quantity,
          condition: product.condition,
          grade: product.grade || null,
          scale: product.scale || null,
          defects: product.defects,
          includedAccessories: product.includedAccessories,
          assemblyState: product.assemblyState,
          boxCondition: product.boxCondition || null,
        };
      }
      const terms: SupportTerms = { outcome, details, refundVnd, replacement },
        version = request.resolutionVersion + 1;
      await request.update(
        { resolutionVersion: version, resolutionStatus: 'offered', resolutionTerms: terms },
        { transaction },
      );
      await ReturnEventModel.create(
        {
          returnRequestId: id,
          actorUserId,
          action: 'offered',
          productId: replacement?.productId || null,
          details: { version, terms },
        },
        { transaction },
      );
    });
    return this.detail(id, actorUserId, true);
  }
  async decide(id: number, userId: number, data: Record<string, unknown>) {
    if (data.decision !== 'accepted' && data.decision !== 'rejected')
      throw HttpError.badRequest('Accept or reject the current terms.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.actor(userId, false, transaction);
      const { request } = await this.locked(id, data.expectedVersion, transaction, userId);
      if (request.resolutionStatus === data.decision) return;
      if (request.resolutionStatus !== 'offered' || !request.resolutionTerms)
        throw HttpError.conflict('There is no open offer to accept.');
      const terms = request.resolutionTerms as SupportTerms;
      if (data.decision === 'accepted' && terms.replacement) {
        const product = await ProductModel.findByPk(terms.replacement.productId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!product || !isSellable(product) || product.stock < terms.replacement.quantity)
          throw HttpError.conflict('Replacement stock changed. Ask staff to revise the offer.');
        if (
          product.name !== terms.replacement.name ||
          product.condition !== terms.replacement.condition ||
          JSON.stringify(product.defects) !== JSON.stringify(terms.replacement.defects) ||
          JSON.stringify(product.includedAccessories) !== JSON.stringify(terms.replacement.includedAccessories) ||
          product.assemblyState !== terms.replacement.assemblyState ||
          (product.boxCondition || null) !== terms.replacement.boxCondition ||
          product.sku !== terms.replacement.sku ||
          (product.grade || null) !== terms.replacement.grade ||
          (product.scale || null) !== terms.replacement.scale ||
          product.imageUrl !== terms.replacement.imageUrl
        )
          throw HttpError.conflict('Replacement condition changed. Review a revised offer.');
        await product.update({ stock: product.stock - terms.replacement.quantity }, { transaction });
      }
      await request.update(
        {
          resolutionStatus: data.decision,
          resolutionInventoryAllocated: data.decision === 'accepted' && !!terms.replacement,
        },
        { transaction },
      );
      await ReturnEventModel.create(
        {
          returnRequestId: id,
          actorUserId: userId,
          action: data.decision,
          productId: terms.replacement?.productId || null,
          details: { version: request.resolutionVersion, terms },
        },
        { transaction },
      );
    });
    return this.detail(id, userId);
  }
  async fulfill(id: number, actorUserId: number, data: Record<string, unknown>) {
    const fulfillmentReference = text(data.externalReference).toUpperCase(),
      details = text(data.details);
    const initial = await this.detail(id, actorUserId, true),
      terms = initial.resolutionTerms as SupportTerms | null;
    if (
      initial.resolutionVersion !== data.expectedVersion ||
      !terms ||
      !['accepted', 'resolved'].includes(initial.resolutionStatus || '')
    )
      throw HttpError.conflict('The customer must accept the exact resolution first.');
    if (initial.resolutionStatus === 'resolved') {
      const event = await ReturnEventModel.findOne({
        where: { returnRequestId: id, action: 'resolved' },
        order: [['id', 'DESC']],
      });
      if (event?.details.externalReference !== fulfillmentReference)
        throw HttpError.conflict('The case was resolved with a different reference.');
      return initial;
    }
    if (physical.has(terms.outcome) && data.handoverVerified !== true)
      throw HttpError.badRequest('Verify the repair, parts or replacement were actually completed and handed over.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.actor(actorUserId, true, transaction);
      // Match the refund service's reference -> order lock order, then serialize this case.
      if (terms.refundVnd > 0) {
        await MoneyReferenceService.lock(fulfillmentReference, 'order_refund', transaction);
        await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836206, hashtext(:reference))', {
          transaction,
          replacements: { reference: fulfillmentReference },
        });
      }
      const { request, order } = await this.locked(id, data.expectedVersion, transaction);
      if (request.resolutionStatus === 'resolved') {
        const event = await ReturnEventModel.findOne({
          where: { returnRequestId: id, action: 'resolved' },
          transaction,
        });
        if (event?.details.externalReference !== fulfillmentReference)
          throw HttpError.conflict('The case was resolved with a different reference.');
        return;
      }
      if (request.resolutionStatus !== 'accepted') throw HttpError.conflict('No accepted agreement is available.');
      let lineRefunds: { orderItemId: number; merchandiseVnd: number }[] | undefined;
      if (terms.refundVnd > 0) {
        const lines = await OrderItemModel.findAll({ where: { orderId: order.id }, transaction });
        const source = await PawnContractModel.findOne({ where: { productId: lines.map(line => line.productId), status: 'disposed' }, transaction });
        if (source) {
          const returns = await ReturnItemModel.findAll({ where: { returnRequestId: id }, transaction });
          const discounts = allocateVnd(order.discount, lines.map(line => ({ id: line.id, valueVnd: line.quantity * line.unitPrice })));
          const previous = await OrderRefundModel.findAll({ where: { orderId: order.id }, transaction });
          const weights = returns.map(returned => {
            const line = lines.find(line => line.id === returned.orderItemId)!;
            let paidVnd = 0;
            for (const refund of previous) {
              if (refund.lineRefunds) paidVnd += refund.lineRefunds.filter(part => part.orderItemId === line.id).reduce((sum, part) => sum + part.merchandiseVnd, 0);
              else if (lines.length === 1) paidVnd += refund.merchandiseVnd;
              else if (refund.merchandiseVnd > 0) throw HttpError.conflict('Reconcile retained line refunds before paying this case.');
            }
            const netVnd = line.quantity * line.unitPrice - (discounts.get(line.id) || 0);
            return { id: line.id, valueVnd: Math.max(0, Math.floor(netVnd * returned.quantity / line.quantity) - paidVnd) };
          });
          if (!weights.length || terms.refundVnd > weights.reduce((sum, line) => sum + line.valueVnd, 0))
            throw HttpError.conflict('The agreed refund exceeds the remaining original returned-line value. Review the offer.');
          const allocation = allocateVnd(terms.refundVnd, weights);
          lineRefunds = weights.map(line => ({ orderItemId: line.id, merchandiseVnd: allocation.get(line.id)! }));
        }
      }
      const refund =
        terms.refundVnd > 0
          ? await new LoyaltyService().confirmRefund(
              initial.orderId,
              actorUserId,
              {
                externalReference: fulfillmentReference,
                merchandiseVnd: terms.refundVnd,
                moneyVerified: data.moneyVerified,
                reason: details,
                ...(lineRefunds ? { lineRefunds } : {}),
              },
              transaction,
            )
          : null;
      if (
        refund &&
        (await ReturnEventModel.findOne({
          where: { action: 'resolved', details: { refundId: refund.id } },
          transaction,
        }))
      )
        throw HttpError.conflict('This payout already resolved another case.');
      if (terms.replacement) {
        if (!request.resolutionInventoryAllocated)
          throw HttpError.conflict('The replacement inventory is not reserved.');
        const product = await ProductModel.findByPk(terms.replacement.productId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!product) throw HttpError.notFound();
        await product.increment('sold', { by: terms.replacement.quantity, transaction });
      }
      await request.update({ resolutionStatus: 'resolved' }, { transaction });
      await ReturnEventModel.create(
        {
          returnRequestId: id,
          actorUserId,
          action: 'resolved',
          productId: terms.replacement?.productId || null,
          details: {
            version: request.resolutionVersion,
            terms,
            externalReference: fulfillmentReference,
            details,
            refundId: refund?.id || null,
          },
        },
        { transaction },
      );
      if (order.requiresCollectionConfirmation)
        await new LoyaltyService().reconcileOrder(order, actorUserId, transaction);
    });
    return this.detail(id, actorUserId, true);
  }
}
