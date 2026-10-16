import { Op, Transaction } from 'sequelize';
import CommerceNotificationModel from '../database/client/models/CommerceNotification.Model';
import AdminAlertModel, { type AdminAlertKind } from '../database/client/models/AdminAlert.Model';
import NotificationDeliveryModel from '../database/client/models/NotificationDelivery.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import MailService from './MailService';
import { sendZaloText, zaloMode, zaloRecipients } from './delivery/ZaloClient';

export const MAX_DELIVERY_ATTEMPTS = 3;

export interface CustomerMessage {
  userId: number;
  kind: string;
  entityId: number;
  // One notification per key: a repeated event (webhook retry, double click) never notifies twice.
  dedupeKey: string;
  details: Record<string, unknown>;
  email?: { subject: string; body: string } | null;
}

export interface AdminMessage {
  kind: AdminAlertKind;
  orderId: number | null;
  dedupeKey: string;
  title: string;
  content: string;
}

// The website inbox (always), the customer's email and the shop's Zalo/admin alerts. Rows are created inside the
// business transaction, so a rolled-back change notifies nobody; messages go out after it commits (`dispatch`), and
// failures are retried a few times by the background job without touching the order.
export default class NotificationDispatchService {
  private mail = new MailService();

  async notifyCustomer(message: CustomerMessage, transaction?: Transaction) {
    const [row, created] = await CommerceNotificationModel.findOrCreate({
      where: { dedupeKey: message.dedupeKey },
      defaults: {
        dedupeKey: message.dedupeKey,
        userId: message.userId,
        kind: message.kind,
        entityId: message.entityId,
        details: message.details,
      },
      transaction,
    });
    if (!created || !message.email) return row;
    // Only the account owner's own address; a customer without one still has the website notification.
    const user = await UserModel.findByPk(message.userId, { attributes: ['email', 'isActive'], transaction });
    if (user?.isActive && user.email)
      await NotificationDeliveryModel.create(
        {
          channel: 'email',
          sourceType: 'customer_notification',
          sourceId: row.id,
          recipient: user.email,
          subject: message.email.subject,
          body: message.email.body,
        },
        { transaction },
      );
    return row;
  }

  async alertAdmins(message: AdminMessage, transaction?: Transaction) {
    const [alert, created] = await AdminAlertModel.findOrCreate({
      where: { dedupeKey: message.dedupeKey },
      defaults: { ...message, status: 'open' },
      transaction,
    });
    if (!created) return alert;
    const recipients = zaloMode() === 'live' ? zaloRecipients() : ['admin-alert-list'];
    for (const recipient of recipients)
      await NotificationDeliveryModel.create(
        {
          channel: 'zalo',
          sourceType: 'admin_alert',
          sourceId: alert.id,
          recipient,
          subject: message.title,
          body: `${message.title}\n${message.content}`,
        },
        { transaction },
      );
    return alert;
  }

  // Sends pending deliveries (and retries failed ones). Safe to run concurrently: each row is claimed with SKIP LOCKED.
  async dispatch(limit = 50) {
    let processed = 0;
    for (let index = 0; index < limit; index++) {
      const claimed = await NotificationDeliveryModel.sequelize!.transaction(async (transaction) => {
        const row = await NotificationDeliveryModel.findOne({
          where: {
            [Op.or]: [{ status: 'pending' }, { status: 'failed', attemptCount: { [Op.lt]: MAX_DELIVERY_ATTEMPTS } }],
          },
          order: [['id', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
          skipLocked: true,
        });
        if (!row) return false;
        await this.send(row, transaction);
        return true;
      });
      if (!claimed) break;
      processed++;
    }
    return processed;
  }

  private async send(row: NotificationDeliveryModel, transaction: Transaction) {
    const attemptCount = row.attemptCount + 1;
    try {
      if (row.channel === 'email') {
        const providerMessageId = await this.mail.sendTransactional(row.recipient, row.subject, row.body);
        await row.update(
          providerMessageId
            ? { status: 'sent', attemptCount, providerMessageId, sentAt: new Date(), lastError: null }
            : { status: 'skipped', attemptCount, lastError: 'SMTP is not configured: logged only' },
          { transaction },
        );
        return;
      }
      const result = await sendZaloText(row.recipient, row.body);
      await row.update(
        {
          status: result.status,
          attemptCount,
          providerMessageId: result.providerMessageId ?? null,
          lastError: result.error ?? null,
          sentAt: result.status === 'sent' ? new Date() : null,
        },
        { transaction },
      );
    } catch (error) {
      Logger.ERROR(`Notification delivery ${row.id} failed:`, error);
      await row.update({ status: 'failed', attemptCount, lastError: String((error as Error).message || error).slice(0, 1000) }, { transaction });
    }
  }

  // Fire-and-forget after a committed change; the background job picks up anything left.
  dispatchSoon() {
    void this.dispatch().catch((error) => Logger.ERROR('Notification dispatch failed:', error));
  }

  async listAlerts(status: 'open' | 'resolved' | 'all' = 'open') {
    const alerts = await AdminAlertModel.findAll({
      where: status === 'all' ? {} : { status },
      order: [['id', 'DESC']],
      limit: 100,
    });
    const deliveries = await NotificationDeliveryModel.findAll({
      where: { sourceType: 'admin_alert', sourceId: { [Op.in]: alerts.map((alert) => alert.id) } },
      attributes: { exclude: ['body'] },
      order: [['id', 'ASC']],
    });
    return alerts.map((alert) => ({
      ...alert.get({ plain: true }),
      deliveries: deliveries.filter((delivery) => delivery.sourceId === alert.id),
    }));
  }

  async resolveAlert(id: number, actorUserId: number) {
    const alert = await AdminAlertModel.findByPk(id);
    if (!alert) throw HttpError.notFound();
    if (alert.status !== 'resolved') await alert.update({ status: 'resolved', resolvedByUserId: actorUserId });
    return alert;
  }

  // Staff retry of a failed delivery, outside the automatic attempt limit.
  async retryDelivery(id: number) {
    const row = await NotificationDeliveryModel.findByPk(id);
    if (!row) throw HttpError.notFound();
    if (row.status === 'sent') throw HttpError.conflict('This message was already delivered.');
    await row.update({ status: 'pending', attemptCount: 0 });
    await this.dispatch(5);
    return row.reload();
  }

  async listForOrder(orderId: number) {
    const [alerts, notifications] = await Promise.all([
      AdminAlertModel.findAll({ where: { orderId }, order: [['id', 'ASC']] }),
      CommerceNotificationModel.findAll({
        where: { entityId: orderId, kind: { [Op.like]: 'order_%' } },
        order: [['id', 'ASC']],
      }),
    ]);
    const deliveries = await NotificationDeliveryModel.findAll({
      where: {
        [Op.or]: [
          { sourceType: 'admin_alert', sourceId: { [Op.in]: alerts.map((row) => row.id) } },
          { sourceType: 'customer_notification', sourceId: { [Op.in]: notifications.map((row) => row.id) } },
        ],
      },
      attributes: { exclude: ['body'] },
      order: [['id', 'ASC']],
    });
    return { alerts, notifications, deliveries };
  }
}
