import type { Transaction } from 'sequelize';
import OrderModel from '../../database/client/models/Order.Model';
import OrderItemModel from '../../database/client/models/OrderItem.Model';
import UserModel from '../../database/internal/models/User.Model';
import { remainingProductVnd } from '../../../../shared/fulfillment';
import { transferMemo } from '../../../../shared/payment';
import NotificationDispatchService from '../NotificationDispatchService';
import * as Messages from './Messages';

// The notices of the deposit and delivery workflow, created inside the caller's transaction.
export default class FulfillmentNotices {
  private notices = new NotificationDispatchService();

  async facts(order: OrderModel, transaction?: Transaction): Promise<Messages.OrderFacts> {
    const [items, user] = await Promise.all([
      OrderItemModel.findAll({ where: { orderId: order.id }, attributes: ['productName', 'quantity'], transaction }),
      UserModel.findByPk(order.userId, { attributes: ['firstName', 'lastName'], transaction }),
    ]);
    return {
      orderCode: transferMemo(order.id),
      customerName: user ? `${user.lastName} ${user.firstName}`.trim() : order.recipientName,
      customerPhone: order.phone,
      productSummary: items.map((item) => `${item.productName} × ${item.quantity}`).join(', '),
      productTotalVnd: order.total,
      confirmedPaidVnd: order.prepaidVnd,
      remainingVnd: remainingProductVnd(order.total, order.prepaidVnd),
    };
  }

  address(order: OrderModel) {
    return [order.address, order.ward, order.district, order.city].filter(Boolean).join(', ');
  }

  requestedTime(order: OrderModel) {
    const requested = order.meeting?.requested;
    return requested ? `${requested.date} (${requested.slot.replace('-', 'h–')}h)` : '';
  }

  // ZALO-01/02 for the shop, and the deposit confirmation for the customer (website + email).
  async depositConfirmed(order: OrderModel, transaction: Transaction) {
    if (!order.fulfillmentMethod) return;
    const facts = await this.facts(order, transaction);
    const meeting = order.fulfillmentMethod === 'DIRECT_MEETING';
    const admin = meeting
      ? Messages.adminMeetingDeposited(facts, this.address(order), this.requestedTime(order), order.id)
      : Messages.adminCodDeposited(facts, this.address(order), order.id);
    await this.notices.alertAdmins(
      { kind: meeting ? 'meeting_order_deposited' : 'cod_order_deposited', orderId: order.id, dedupeKey: `order:${order.id}:deposited`, ...admin },
      transaction,
    );
    await this.notices.notifyCustomer(
      {
        userId: order.userId,
        kind: meeting ? 'order_meeting_deposit' : 'order_cod_deposit',
        entityId: order.id,
        dedupeKey: `order:${order.id}:deposit-customer`,
        details: {
          orderCode: facts.orderCode,
          confirmedPaidVnd: facts.confirmedPaidVnd,
          remainingVnd: facts.remainingVnd,
          meetingAddress: meeting ? this.address(order) : null,
        },
        email: meeting ? Messages.emailMeetingDeposit(facts, this.address(order), this.requestedTime(order)) : Messages.emailCodDeposit(facts),
      },
      transaction,
    );
  }
}
