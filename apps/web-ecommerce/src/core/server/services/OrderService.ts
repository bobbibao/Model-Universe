import LoyaltyService from './LoyaltyService';
import MoneyReferenceService from './MoneyReferenceService';
import { validateShipping } from '../../../shared/server/utils/ShippingValidation';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { createHash } from 'crypto';
import OrderModel, { OrderStatus } from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import OrderReceiptModel from '../database/client/models/OrderReceipt.Model';
import ReservationModel from '../database/client/models/Reservation.Model';
import ReservationEventModel from '../database/client/models/ReservationEvent.Model';
import ProductModel from '../database/client/models/Product.Model';
import CouponModel from '../database/client/models/Coupon.Model';
import UserModel from '../database/internal/models/User.Model';
import DatabaseProvider from '../database/Database.Provider';
import { BaseServiceInterface } from './BaseServiceInterface';
import CartService, { normalizeCartItems } from './CartService';
import { assertCouponUsable, couponDiscount, normalizeCouponCode } from './CouponService';
import ConversionService from './marketing/ConversionService';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';
import type { Attribution } from '../../../shared/server/utils/AttributionUtils';
import type { ConsentChoice } from '../../../shared/server/utils/ConsentUtils';

export interface OrderListQuery {
  status?: string;
  q?: string;
  limit: number;
  offset: number;
  sortKey?: string;
  sortDirection?: string;
}

const STATUSES: OrderStatus[] = ['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã huỷ',
};

// Allowed status changes. Cancelling is only possible before shipping.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const SHIPPING_FEE = 0;
const TAX = 0;
const SORTABLE_COLUMNS = ['id', 'total', 'status', 'createdAt', 'updatedAt'];

const itemsInclude = { model: OrderItemModel, as: 'items' };
const userInclude = { model: UserModel, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] };

export default class OrderService implements BaseServiceInterface<OrderModel> {
  private cartService = new CartService();

  findByPk(id: string | number): Promise<OrderModel | null> {
    return OrderModel.findByPk(id);
  }

  findAll(): Promise<OrderModel[]> {
    return OrderModel.findAll({ order: [['id', 'DESC']] });
  }

  // Orders are created through placeOrder only.
  insert(): Promise<OrderModel | null> {
    throw new Error('Use OrderService.placeOrder to create orders.');
  }

  bulkInsert(): Promise<OrderModel[] | null> {
    throw new Error('Method not implemented.');
  }

  validateShipping(data: Record<string, unknown>) {
    return validateShipping(data);
  }

  // Places a COD order: re-checks every line against locked product rows, applies the coupon,
  // takes the stock and records the order in one transaction, with where the visit came from (`attribution`, the
  // storefront's last non-direct click; null for a direct visit). Then the purchase goes to the ad platforms whose
  // tag is configured (ConversionService; customer identifiers only with marketing `consent`), without delaying the
  // answer.
  async placeOrder(
    userId: number,
    data: Record<string, unknown>,
    attribution: Attribution | null = null,
    consent: ConsentChoice | null = null,
  ) {
    const items = normalizeCartItems(data.items);
    if (items.length === 0) throw HttpError.badRequest('Giỏ hàng đang trống.');
    const shipping = this.validateShipping((data.shipping as Record<string, unknown>) || {});
    if (
      data.expectedTotal !== undefined &&
      (typeof data.expectedTotal !== 'number' || !Number.isSafeInteger(data.expectedTotal) || data.expectedTotal < 0)
    ) {
      throw HttpError.badRequest('Tổng tiền xác nhận không hợp lệ.');
    }
    const couponCode = normalizeCouponCode(data.couponCode);
    const useMemberDiscount = data.useMemberDiscount === true;
    if (useMemberDiscount && couponCode) throw HttpError.conflict('Select only one order benefit.', 'BENEFIT_CONFLICT');
    const checkoutKey = data.requestKey;
    if (checkoutKey !== undefined && (typeof checkoutKey !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(checkoutKey)))
      throw HttpError.badRequest('Invalid checkout request reference.');
    const checkoutDigest = createHash('sha256')
      .update(JSON.stringify({ items, shipping, couponCode, expectedTotal: data.expectedTotal, useMemberDiscount }))
      .digest('hex');
    const replay = async () => {
      if (!checkoutKey) return null;
      const existing = await OrderModel.findOne({ where: { userId, checkoutKey } });
      if (!existing) return null;
      if (existing.checkoutDigest !== checkoutDigest)
        throw HttpError.conflict('This checkout reference was already used for a different order request.');
      return this.getForUser(userId, existing.id);
    };
    const previous = await replay();
    if (previous) return previous;
    let purchaseLines: { sku: string; quantity: number; unitPriceVnd: number }[] = [];

    let orderId: number;
    try {
      orderId = await DatabaseProvider.getInstance().transaction(async (transaction) => {
        const { lines, products } = await this.cartService.resolveLines(items, { transaction, lock: true });
        const problems = lines.filter((line) => line.status !== 'OK');
        if (problems.length > 0) {
          throw HttpError.badRequest(
            'Một số sản phẩm trong giỏ hàng không còn hợp lệ, vui lòng kiểm tra lại giỏ hàng.',
            problems.map((line) => `${line.product?.name || `Sản phẩm #${line.productId}`}: ${line.message}`),
          );
        }

        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        if (!Number.isSafeInteger(subtotal) || subtotal < 1 || subtotal > 2147483647)
          throw HttpError.badRequest('The merchandise total exceeds the supported integer VND range.');
        let discount = 0;
        let ownedCoupon: CouponModel | null = null;
        let benefitSnapshot: Record<string, unknown> | null = null;
        if (useMemberDiscount) {
          const benefit = await new LoyaltyService().memberDiscount(
            userId,
            lines.map((line) => ({
              listPrice: line.product!.price,
              salePrice: line.product!.salePrice,
              quantity: line.quantity,
            })),
            transaction,
          );
          discount = benefit.discount;
          benefitSnapshot = benefit.snapshot;
        }
        if (couponCode) {
          const coupon = assertCouponUsable(
            await CouponModel.findOne({ where: { code: couponCode }, transaction, lock: transaction.LOCK.UPDATE }),
            subtotal,
            userId,
          );
          discount = couponDiscount(
            coupon,
            lines.map((line) => ({
              listPrice: line.product?.price ?? 0,
              salePrice: line.product?.salePrice ?? 0,
              quantity: line.quantity,
            })),
          );
          if (coupon.source === 'loyalty') {
            ownedCoupon = coupon;
            benefitSnapshot = {
              kind: 'reward',
              couponCode: coupon.code,
              fixedAmountVnd: coupon.fixedAmountVnd,
              discountPercent: coupon.discountPercent,
              maxDiscountVnd: coupon.maxDiscountVnd,
              policy: coupon.policySnapshot,
            };
          } else await coupon.increment('usageCount', { transaction });
        }

        if (data.expectedTotal !== undefined && data.expectedTotal !== subtotal - discount + SHIPPING_FEE + TAX) {
          throw HttpError.conflict('The price changed. Review and confirm the latest quote.', 'PRICE_CHANGED');
        }
        const order = await OrderModel.create(
          {
            userId,
            checkoutKey: checkoutKey || null,
            checkoutDigest: checkoutKey ? checkoutDigest : null,
            status: 'PROCESSING',
            paymentMethod: 'COD',
            paymentStatus: 'PENDING',
            requiresCollectionConfirmation: true,
            subtotal,
            discount,
            shippingFee: SHIPPING_FEE,
            tax: TAX,
            total: subtotal - discount + SHIPPING_FEE + TAX,
            couponCode: couponCode || null,
            benefitSnapshot,
            ...shipping,
            ...(attribution ?? {}),
          },
          { transaction },
        );
        if (ownedCoupon) await ownedCoupon.update({ reservedOrderId: order.id }, { transaction });
        await OrderItemModel.bulkCreate(
          lines.map((line) => ({
            orderId: order.id,
            productId: line.productId,
            productName: line.product?.name,
            imageUrl: line.product?.imageUrl,
            size: line.size,
            quantity: line.quantity,
            modelSnapshot: (() => {
              const product = products.get(line.productId) as ProductModel;
              return {
                sku: product.sku,
                grade: product.grade,
                scale: product.scale,
                series: product.series,
                modelCode: product.modelCode,
                condition: product.condition,
                assemblyState: product.assemblyState,
                boxCondition: product.boxCondition,
                includedAccessories: product.includedAccessories,
                defects: product.defects,
                descriptionEn: product.descriptionEn,
                descriptionVi: product.descriptionVi,
              };
            })(),
            // The effective price (after any running discount) the line was charged at.
            unitPrice: line.product?.salePrice,
          })),
          { transaction },
        );
        for (const line of lines) {
          const product = products.get(line.productId) as ProductModel;
          await product.update(
            { stock: product.stock - line.quantity, sold: product.sold + line.quantity },
            { transaction },
          );
        }
        purchaseLines = lines.map((line) => ({
          sku: (products.get(line.productId) as ProductModel).sku,
          quantity: line.quantity,
          unitPriceVnd: line.product?.salePrice ?? 0,
        }));
        return order.id;
      });
    } catch (error) {
      const completed = await replay();
      if (completed) return completed;
      throw error;
    }
    const order = await this.getForUser(userId, orderId);
    const user = await UserModel.findByPk(userId, { attributes: ['email'] });
    void new ConversionService().recordPurchase({ order, email: user?.email ?? null, lines: purchaseLines, consent });
    return order;
  }

  async listForUser(userId: number, limit: number, offset: number) {
    return OrderModel.findAndCountAll({
      where: { userId },
      include: [itemsInclude],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
  }

  async getForUser(userId: number, orderId: number) {
    const order = await OrderModel.findOne({ where: { id: orderId, userId }, include: [itemsInclude] });
    if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
    return order;
  }

  // Puts the stock back and releases the coupon use of a cancelled order.
  private async restoreInventory(order: OrderModel, transaction: Transaction, keepReserved = false) {
    const items = await OrderItemModel.findAll({ where: { orderId: order.id }, transaction });
    for (const item of items) {
      const product = await ProductModel.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (product) {
        await product.update(
          {
            stock: product.stock + (keepReserved ? 0 : item.quantity),
            sold: Math.max(0, product.sold - item.quantity),
          },
          { transaction },
        );
      }
    }
    if (order.couponCode) {
      await CouponModel.update(
        { reservedOrderId: null },
        { where: { code: order.couponCode, source: 'loyalty', reservedOrderId: order.id }, transaction },
      );
      await CouponModel.decrement('usageCount', {
        where: { code: order.couponCode, source: { [Op.ne]: 'loyalty' }, usageCount: { [Op.gt]: 0 } },
        transaction,
      });
    }
  }

  private async changeStatus(
    order: OrderModel,
    nextStatus: OrderStatus,
    transaction: Transaction,
    actorUserId?: number,
  ) {
    if (!TRANSITIONS[order.status].includes(nextStatus)) {
      throw HttpError.badRequest(
        `Không thể chuyển đơn hàng từ "${STATUS_LABELS[order.status]}" sang "${STATUS_LABELS[nextStatus]}".`,
      );
    }
    const reservation = await ReservationModel.findOne({
      where: { orderId: order.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (reservation && !actorUserId)
      throw HttpError.badRequest('An identified actor is required to change a reservation order.');
    if (nextStatus === 'CANCELLED') {
      await this.restoreInventory(order, transaction, !!reservation);
      if (reservation) {
        const status =
          reservation.paidVnd === reservation.totalVnd
            ? 'fully_paid'
            : reservation.expiresAt && reservation.expiresAt < new Date()
              ? 'expired'
              : 'holding';
        await reservation.update({ status, orderId: null, shipping: null, deliveryMethod: null }, { transaction });
        await ReservationEventModel.create(
          {
            reservationId: reservation.id,
            actorUserId,
            action: 'order_cancelled',
            reason: 'Unshipped fulfillment cancelled; deposit and inventory allocation retained.',
            details: { orderId: order.id },
          },
          { transaction },
        );
      }
    }
    if (
      nextStatus === 'DELIVERED' &&
      reservation &&
      (order.paymentStatus === 'PAID' || !order.requiresCollectionConfirmation)
    ) {
      await reservation.update({ status: 'completed' }, { transaction });
      await ReservationEventModel.create(
        {
          reservationId: reservation.id,
          actorUserId,
          action: 'completed',
          reason: 'The linked order was delivered and its COD balance was collected.',
          details: { orderId: order.id },
        },
        { transaction },
      );
    }
    // Delivery does not prove remittance. Preserve the old semantics only for retained orders.
    await order.update(
      {
        status: nextStatus,
        ...(nextStatus === 'DELIVERED'
          ? { ...(!order.requiresCollectionConfirmation ? { paymentStatus: 'PAID' } : {}), deliveredAt: new Date() }
          : {}),
      },
      { transaction },
    );
    if (nextStatus === 'DELIVERED' && order.paymentStatus === 'PAID') {
      if (order.couponCode)
        await CouponModel.update(
          { usedAt: new Date(), usageCount: 1, reservedOrderId: null },
          { where: { code: order.couponCode, source: 'loyalty', reservedOrderId: order.id }, transaction },
        );
      await new LoyaltyService().reconcileOrder(order, actorUserId || order.userId, transaction);
    }
  }

  async cancelForUser(userId: number, orderId: number) {
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const order = await OrderModel.findOne({
        where: { id: orderId, userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
      if (order.status !== 'PROCESSING') throw HttpError.badRequest('Chỉ có thể huỷ đơn hàng đang xử lý.');
      await this.changeStatus(order, 'CANCELLED', transaction, userId);
    });
    return this.getForUser(userId, orderId);
  }

  async listAdmin({ status, q, limit, offset, sortKey, sortDirection }: OrderListQuery) {
    const conditions: WhereOptions[] = [];
    if (status && STATUSES.includes(status as OrderStatus)) conditions.push({ status });
    const search = asTrimmedString(q);
    if (search) {
      const id = toInteger(search.replace(/^#/, ''));
      conditions.push({
        [Op.or]: [
          ...(id ? [{ id }] : []),
          { recipientName: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { '$user.email$': { [Op.iLike]: `%${search}%` } },
        ],
      });
    }
    const column = sortKey && SORTABLE_COLUMNS.includes(sortKey) ? sortKey : 'createdAt';
    return OrderModel.findAndCountAll({
      where: { [Op.and]: conditions },
      include: [userInclude],
      order: [[column, sortDirection === 'asc' ? 'ASC' : 'DESC']],
      limit,
      offset,
      distinct: true,
      // The search condition on the joined user email must be in the main query.
      subQuery: false,
    });
  }

  async getAdmin(orderId: number) {
    const order = await OrderModel.findByPk(orderId, { include: [itemsInclude, userInclude] });
    if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
    order.setDataValue('collectionReceipt', await OrderReceiptModel.findOne({ where: { orderId } }));
    return order;
  }

  async confirmCollection(orderId: number, actorUserId: number, data: Record<string, unknown>) {
    const externalReference = asTrimmedString(data.externalReference).toUpperCase();
    const reason = asTrimmedString(data.reason),
      amountVnd = data.amountVnd;
    if (
      !/^[A-Z0-9:_.-]{8,128}$/.test(externalReference) ||
      !reason ||
      reason.length > 1000 ||
      data.moneyVerified !== true ||
      typeof amountVnd !== 'number' ||
      !Number.isSafeInteger(amountVnd) ||
      amountVnd < 1
    )
      throw HttpError.badRequest('Verify the actual remittance amount, reference and reason.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const actor = await UserModel.findByPk(actorUserId, { transaction });
      if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
      await MoneyReferenceService.lock(externalReference, 'order_receipt', transaction);
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836207, hashtext(:reference))', {
        transaction,
        replacements: { reference: externalReference },
      });
      const order = await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw HttpError.notFound();
      const existing = await OrderReceiptModel.findOne({ where: { externalReference }, transaction });
      if (existing) {
        if (existing.orderId !== orderId || existing.amountVnd !== amountVnd)
          throw HttpError.conflict('This remittance reference belongs to another collection.');
        return;
      }
      if (!order.requiresCollectionConfirmation || order.status !== 'DELIVERED' || order.paymentStatus === 'PAID')
        throw HttpError.conflict('Only an unpaid delivered order can receive a COD collection.');
      if (amountVnd !== order.total - order.prepaidVnd)
        throw HttpError.conflict('The verified amount must equal the remaining COD balance.');
      await OrderReceiptModel.create(
        { orderId, confirmedByUserId: actorUserId, amountVnd, externalReference, reason },
        { transaction },
      );
      await order.update({ paymentStatus: 'PAID' }, { transaction });
      const reservation = await ReservationModel.findOne({
        where: { orderId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (reservation && reservation.status !== 'completed') {
        await reservation.update({ status: 'completed' }, { transaction });
        await ReservationEventModel.create(
          {
            reservationId: reservation.id,
            actorUserId,
            action: 'completed',
            reason: 'Delivery and the remaining COD remittance were both verified.',
            details: { orderId, amountVnd, externalReference },
          },
          { transaction },
        );
      }
      if (order.couponCode)
        await CouponModel.update(
          { usedAt: new Date(), usageCount: 1, reservedOrderId: null },
          { where: { code: order.couponCode, source: 'loyalty', reservedOrderId: orderId }, transaction },
        );
      await new LoyaltyService().reconcileOrder(order, actorUserId, transaction);
    });
    return this.getAdmin(orderId);
  }

  async updateStatus(orderId: number, rawStatus: unknown, actorUserId?: number) {
    const nextStatus = asTrimmedString(rawStatus) as OrderStatus;
    if (!STATUSES.includes(nextStatus)) throw HttpError.badRequest('Trạng thái đơn hàng không hợp lệ.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const order = await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
      await this.changeStatus(order, nextStatus, transaction, actorUserId);
    });
    return this.getAdmin(orderId);
  }
}
