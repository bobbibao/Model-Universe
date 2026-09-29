import { Op, Transaction, WhereOptions } from 'sequelize';
import OrderModel from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import ProductModel from '../database/client/models/Product.Model';
import ReturnRequestModel, { ReturnStatus } from '../database/client/models/ReturnRequest.Model';
import ReturnItemModel, {
  RESTOCKABLE_CONDITIONS,
  RETURN_CONDITIONS,
  RETURN_REASONS,
  ReturnCondition,
  ReturnReason,
} from '../database/client/models/ReturnItem.Model';
import UserModel from '../database/internal/models/User.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

// Returns: a customer asks to return lines of a delivered order within the return window; an admin receives
// (with each line's condition and refund) or rejects the request, once. Neither step changes stock or the
// order: stock changes only when an admin explicitly restocks a received line in sellable condition, and the
// refund is recorded here and paid outside the system (cash on delivery shop).

export const RETURN_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NOTE_LENGTH = 1000;
const STATUSES: ReturnStatus[] = ['REQUESTED', 'RECEIVED', 'REJECTED'];

const itemsInclude = {
  model: ReturnItemModel,
  as: 'items',
  include: [
    {
      model: OrderItemModel,
      as: 'orderItem',
      attributes: ['id', 'productId', 'productName', 'imageUrl', 'size', 'quantity', 'unitPrice'],
    },
  ],
};

// Delivery date of an order; orders delivered before `deliveredAt` existed fall back to their last update.
const deliveredOn = (order: OrderModel): Date => new Date(order.deliveredAt ?? order.updatedAt);

const returnDeadline = (order: OrderModel): Date =>
  new Date(deliveredOn(order).getTime() + RETURN_WINDOW_DAYS * DAY_MS);

export default class ReturnService {
  // Quantity of each order line already covered by returns that were not rejected.
  private async requestedQuantities(orderId: number, transaction?: Transaction): Promise<Map<number, number>> {
    const items = await ReturnItemModel.findAll({
      include: [
        {
          model: ReturnRequestModel,
          as: 'returnRequest',
          attributes: [],
          where: { orderId, status: { [Op.ne]: 'REJECTED' } },
        },
      ],
      transaction,
    });
    const quantities = new Map<number, number>();
    items.forEach((item) => quantities.set(item.orderItemId, (quantities.get(item.orderItemId) || 0) + item.quantity));
    return quantities;
  }

  // Why an order cannot be returned (undefined when it can).
  private ineligibility(order: OrderModel): string | undefined {
    if (order.status !== 'DELIVERED') return 'Chỉ có thể trả hàng cho đơn hàng đã giao.';
    if (Date.now() > returnDeadline(order).getTime()) {
      return `Đã quá thời hạn ${RETURN_WINDOW_DAYS} ngày kể từ ngày giao để yêu cầu trả hàng.`;
    }
    return undefined;
  }

  // Return information for one of the customer's orders: deadline, what can still be returned, and requests.
  async getForOrder(userId: number, orderId: number) {
    const order = await OrderModel.findOne({
      where: { id: orderId, userId },
      include: [{ model: OrderItemModel, as: 'items' }],
    });
    if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
    const requested = await this.requestedQuantities(orderId);
    const returns = await ReturnRequestModel.findAll({
      where: { orderId, userId },
      attributes: ['id', 'status', 'customerNote', 'adminNote', 'receivedAt', 'processedAt', 'createdAt'],
      include: [itemsInclude],
      order: [['createdAt', 'DESC']],
    });
    const blocked = this.ineligibility(order);
    return {
      canRequest: !blocked,
      blockedReason: blocked ?? null,
      deadline: order.status === 'DELIVERED' ? returnDeadline(order) : null,
      lines: ((order.get('items') as OrderItemModel[]) || []).map((item) => ({
        orderItemId: item.id,
        returnable: Math.max(0, item.quantity - (requested.get(item.id) || 0)),
      })),
      returns,
    };
  }

  async create(userId: number, data: Record<string, unknown>) {
    const orderId = toInteger(data.orderId);
    const note = asTrimmedString(data.note);
    const rawItems = Array.isArray(data.items) ? data.items : [];
    if (!orderId) throw HttpError.badRequest('Đơn hàng không hợp lệ.');

    const requestId = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      // Locking the order serialises concurrent requests for it, so quantities cannot be claimed twice.
      const order = await OrderModel.findOne({
        where: { id: orderId, userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
      const blocked = this.ineligibility(order);
      if (blocked) throw HttpError.badRequest(blocked);

      const orderItems = new Map(
        (await OrderItemModel.findAll({ where: { orderId }, transaction })).map((item) => [item.id, item]),
      );
      const requested = await this.requestedQuantities(orderId, transaction);
      const errors: string[] = [];
      const seen = new Set<number>();
      const lines = rawItems.map((raw) => {
        const orderItemId = toInteger(raw?.orderItemId) || 0;
        const quantity = toInteger(raw?.quantity) || 0;
        const reason = asTrimmedString(raw?.reason) as ReturnReason;
        const orderItem = orderItems.get(orderItemId);
        if (!orderItem || seen.has(orderItemId)) {
          errors.push('Sản phẩm trả không thuộc đơn hàng này.');
          return null;
        }
        seen.add(orderItemId);
        const returnable = orderItem.quantity - (requested.get(orderItemId) || 0);
        if (quantity < 1 || quantity > returnable) {
          errors.push(`${orderItem.productName}: chỉ có thể trả tối đa ${Math.max(0, returnable)} sản phẩm.`);
        }
        if (!RETURN_REASONS.includes(reason)) errors.push(`${orderItem.productName}: vui lòng chọn lý do trả hàng.`);
        return { orderItemId, quantity, reason };
      });
      if (lines.length === 0) errors.push('Vui lòng chọn ít nhất một sản phẩm để trả.');
      if (note.length > MAX_NOTE_LENGTH) errors.push(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
      if (errors.length > 0) throw HttpError.badRequest('Yêu cầu trả hàng chưa hợp lệ.', errors);

      const request = await ReturnRequestModel.create({ orderId, userId, customerNote: note || null }, { transaction });
      await ReturnItemModel.bulkCreate(
        lines.map((line) => ({ ...line, returnRequestId: request.id })),
        { transaction },
      );
      return request.id;
    });
    return ReturnRequestModel.findByPk(requestId, { include: [itemsInclude] });
  }

  async listAdmin(status: string | undefined, limit: number, offset: number) {
    const where: WhereOptions = STATUSES.includes(status as ReturnStatus) ? { status } : {};
    return ReturnRequestModel.findAndCountAll({
      where,
      include: [itemsInclude, { model: UserModel, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      // Waiting requests first (ENUM declaration order), then the newest.
      order: [
        ['status', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
      distinct: true,
    });
  }

  async getAdmin(id: number) {
    const request = await ReturnRequestModel.findByPk(id, {
      include: [
        itemsInclude,
        { model: UserModel, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
        { model: OrderModel, as: 'order', attributes: ['id', 'deliveredAt', 'total', 'createdAt'] },
      ],
    });
    if (!request) throw HttpError.notFound('Không tìm thấy yêu cầu trả hàng.');
    return request;
  }

  // Receive (with each line's condition and refund) or reject a waiting request. Stock is not changed here.
  async intake(adminId: number, id: number, data: Record<string, unknown>) {
    const decision = asTrimmedString(data.decision) as ReturnStatus;
    const adminNote = asTrimmedString(data.adminNote);
    if (decision !== 'RECEIVED' && decision !== 'REJECTED') throw HttpError.badRequest('Quyết định không hợp lệ.');
    if (decision === 'REJECTED' && !adminNote) throw HttpError.badRequest('Vui lòng ghi lý do từ chối.');
    if (adminNote.length > MAX_NOTE_LENGTH) throw HttpError.badRequest(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);

    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const request = await ReturnRequestModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!request) throw HttpError.notFound('Không tìm thấy yêu cầu trả hàng.');
      if (request.status !== 'REQUESTED') throw HttpError.conflict('Yêu cầu trả hàng này đã được xử lý.');
      const now = new Date();

      if (decision === 'RECEIVED') {
        const items = await ReturnItemModel.findAll({
          where: { returnRequestId: id },
          include: [{ model: OrderItemModel, as: 'orderItem', attributes: ['productName', 'unitPrice'] }],
          transaction,
        });
        const inputs = new Map((Array.isArray(data.items) ? data.items : []).map((raw) => [toInteger(raw?.id), raw]));
        const errors: string[] = [];
        const updates = items.map((item) => {
          const orderItem = item.get('orderItem') as OrderItemModel;
          const raw = inputs.get(item.id);
          const condition = asTrimmedString(raw?.condition) as ReturnCondition;
          const refundAmount = toInteger(raw?.refundAmount);
          const maxRefund = orderItem.unitPrice * item.quantity;
          if (!RETURN_CONDITIONS.includes(condition)) errors.push(`${orderItem.productName}: chọn tình trạng hàng.`);
          if (refundAmount === undefined || refundAmount < 0 || refundAmount > maxRefund) {
            errors.push(`${orderItem.productName}: số tiền hoàn phải từ 0 đến ${maxRefund.toLocaleString('vi-VN')} đ.`);
          }
          return { item, condition, refundAmount: refundAmount as number };
        });
        if (errors.length > 0) throw HttpError.badRequest('Thông tin nhận hàng chưa hợp lệ.', errors);
        for (const update of updates) {
          await update.item.update({ condition: update.condition, refundAmount: update.refundAmount }, { transaction });
        }
      }

      await request.update(
        {
          status: decision,
          adminNote: adminNote || null,
          receivedAt: decision === 'RECEIVED' ? now : null,
          processedAt: now,
          processedBy: adminId,
        },
        { transaction },
      );
    });
    return this.getAdmin(id);
  }

  // The only step that changes stock: puts a received line in sellable condition back into stock, once.
  async restockItem(returnId: number, itemId: number) {
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const item = await ReturnItemModel.findOne({
        where: { id: itemId, returnRequestId: returnId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item) throw HttpError.notFound('Không tìm thấy sản phẩm trả.');
      const request = await ReturnRequestModel.findByPk(returnId, { transaction });
      if (request?.status !== 'RECEIVED') throw HttpError.badRequest('Chỉ nhập lại kho hàng đã nhận.');
      if (!item.condition || !RESTOCKABLE_CONDITIONS.includes(item.condition)) {
        throw HttpError.badRequest('Hàng hư hỏng không thể nhập lại kho.');
      }
      if (item.restockedAt) throw HttpError.conflict('Sản phẩm này đã được nhập lại kho.');
      const orderItem = await OrderItemModel.findByPk(item.orderItemId, { transaction });
      const product = orderItem
        ? await ProductModel.findByPk(orderItem.productId, { transaction, lock: transaction.LOCK.UPDATE })
        : null;
      if (!product) throw HttpError.notFound('Sản phẩm không còn tồn tại.');
      await product.update({ stock: product.stock + item.quantity }, { transaction });
      await item.update({ restockedAt: new Date() }, { transaction });
    });
    return this.getAdmin(returnId);
  }
}
