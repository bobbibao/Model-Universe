import { Op, Transaction, WhereOptions } from 'sequelize';
import OrderModel, { OrderStatus } from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import ProductModel from '../database/client/models/Product.Model';
import CouponModel from '../database/client/models/Coupon.Model';
import UserModel from '../database/internal/models/User.Model';
import DatabaseProvider from '../database/Database.Provider';
import { BaseServiceInterface } from './BaseServiceInterface';
import CartService, { normalizeCartItems } from './CartService';
import { assertCouponUsable, calculateDiscount, normalizeCouponCode } from './CouponService';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isNonEmpty, isValidPhone, toInteger } from '../../../shared/server/utils/ValidationUtils';

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
const MAX_NOTE_LENGTH = 500;
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

  private validateShipping(data: Record<string, unknown>) {
    const shipping = {
      recipientName: asTrimmedString(data.recipientName),
      phone: asTrimmedString(data.phone),
      address: asTrimmedString(data.address),
      ward: asTrimmedString(data.ward) || null,
      district: asTrimmedString(data.district) || null,
      city: asTrimmedString(data.city),
      note: asTrimmedString(data.note) || null,
    };
    const errors: string[] = [];
    if (!shipping.recipientName) errors.push('Vui lòng nhập tên người nhận.');
    if (!isValidPhone(shipping.phone)) errors.push('Số điện thoại người nhận không hợp lệ.');
    if (!isNonEmpty(shipping.address, 4)) errors.push('Địa chỉ phải có ít nhất 4 ký tự.');
    if (!shipping.city) errors.push('Vui lòng nhập tỉnh/thành phố.');
    if ((shipping.note?.length || 0) > MAX_NOTE_LENGTH) errors.push(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
    if (errors.length > 0) throw HttpError.badRequest('Thông tin giao hàng chưa hợp lệ.', errors);
    return shipping;
  }

  // Places a COD order: re-checks every line against locked product rows, applies the coupon,
  // takes the stock and records the order in one transaction.
  async placeOrder(userId: number, data: Record<string, unknown>) {
    const items = normalizeCartItems(data.items);
    if (items.length === 0) throw HttpError.badRequest('Giỏ hàng đang trống.');
    const shipping = this.validateShipping((data.shipping as Record<string, unknown>) || {});
    const couponCode = normalizeCouponCode(data.couponCode);

    const orderId = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const { lines, products } = await this.cartService.resolveLines(items, { transaction, lock: true });
      const problems = lines.filter((line) => line.status !== 'OK');
      if (problems.length > 0) {
        throw HttpError.badRequest(
          'Một số sản phẩm trong giỏ hàng không còn hợp lệ, vui lòng kiểm tra lại giỏ hàng.',
          problems.map((line) => `${line.product?.name || `Sản phẩm #${line.productId}`}: ${line.message}`),
        );
      }

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      let discount = 0;
      if (couponCode) {
        const coupon = assertCouponUsable(
          await CouponModel.findOne({ where: { code: couponCode }, transaction, lock: transaction.LOCK.UPDATE }),
        );
        discount = calculateDiscount(subtotal, coupon.discountPercent);
        await coupon.increment('usageCount', { transaction });
      }

      const order = await OrderModel.create(
        {
          userId,
          status: 'PROCESSING',
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          subtotal,
          discount,
          shippingFee: SHIPPING_FEE,
          tax: TAX,
          total: subtotal - discount + SHIPPING_FEE + TAX,
          couponCode: couponCode || null,
          ...shipping,
        },
        { transaction },
      );
      await OrderItemModel.bulkCreate(
        lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          productName: line.product?.name,
          imageUrl: line.product?.imageUrl,
          size: line.size,
          quantity: line.quantity,
          unitPrice: line.product?.price,
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
      return order.id;
    });
    return this.getForUser(userId, orderId);
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
  private async restoreInventory(order: OrderModel, transaction: Transaction) {
    const items = await OrderItemModel.findAll({ where: { orderId: order.id }, transaction });
    for (const item of items) {
      const product = await ProductModel.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (product) {
        await product.update(
          { stock: product.stock + item.quantity, sold: Math.max(0, product.sold - item.quantity) },
          { transaction },
        );
      }
    }
    if (order.couponCode) {
      await CouponModel.decrement('usageCount', {
        where: { code: order.couponCode, usageCount: { [Op.gt]: 0 } },
        transaction,
      });
    }
  }

  private async changeStatus(order: OrderModel, nextStatus: OrderStatus, transaction: Transaction) {
    if (!TRANSITIONS[order.status].includes(nextStatus)) {
      throw HttpError.badRequest(
        `Không thể chuyển đơn hàng từ "${STATUS_LABELS[order.status]}" sang "${STATUS_LABELS[nextStatus]}".`,
      );
    }
    if (nextStatus === 'CANCELLED') await this.restoreInventory(order, transaction);
    // Cash on delivery: the order is paid once it has been delivered.
    await order.update(
      { status: nextStatus, ...(nextStatus === 'DELIVERED' ? { paymentStatus: 'PAID' } : {}) },
      { transaction },
    );
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
      await this.changeStatus(order, 'CANCELLED', transaction);
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
    return order;
  }

  async updateStatus(orderId: number, rawStatus: unknown) {
    const nextStatus = asTrimmedString(rawStatus) as OrderStatus;
    if (!STATUSES.includes(nextStatus)) throw HttpError.badRequest('Trạng thái đơn hàng không hợp lệ.');
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const order = await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
      await this.changeStatus(order, nextStatus, transaction);
    });
    return this.getAdmin(orderId);
  }
}
