import { PayOS } from '@payos/node';
import { Op } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import OrderModel from '../database/client/models/Order.Model';
import OrderPaymentLinkModel from '../database/client/models/OrderPaymentLink.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import { transferMemo } from '../../../shared/payment';
import { shopPublicUrl } from './marketing/platforms';
import NotificationDispatchService from './NotificationDispatchService';
import { adminOrderUrl } from './delivery/Messages';
import OrderService from './OrderService';
import { paymentsEnabled } from './PaymentConfig';

export { paymentsEnabled };

// Online upfront payments with payOS (https://payos.vn/docs/api): a payment link for the order's deposit or full
// amount; the money counts only when payOS confirms it, through its signed webhook or a server-side status check, never
// because the browser came back to the return URL. Credentials are web-only: PAYOS_CLIENT_ID, PAYOS_API_KEY,
// PAYOS_CHECKSUM_KEY. Without them checkout keeps the verified manual bank transfer.

const env = (name: string) => process.env[name]?.trim() ?? '';
const LINK_MINUTES = () => Math.min(1440, Math.max(5, Number(env('PAYOS_LINK_MINUTES')) || 30));

// The subset of the SDK this service uses (replaced by a double in tests).
export interface PayOSLike {
  paymentRequests: {
    create(data: Record<string, unknown>): Promise<{ checkoutUrl: string; paymentLinkId: string; status: string }>;
    get(
      orderCode: number,
    ): Promise<{ status: string; amountPaid: number; transactions: { reference: string; amount: number }[] }>;
  };
  webhooks: { verify(body: unknown): Promise<{ orderCode: number; amount: number; reference: string; code: string }> };
}

let client: PayOSLike | null = null;
export const setPayOSClient = (value: PayOSLike | null) => {
  client = value;
};
const payos = (): PayOSLike => {
  if (client) return client;
  if (!paymentsEnabled())
    throw HttpError.serviceUnavailable('Online payment is not configured.', 'PAYMENT_UNAVAILABLE');
  client = new PayOS({
    clientId: env('PAYOS_CLIENT_ID'),
    apiKey: env('PAYOS_API_KEY'),
    checksumKey: env('PAYOS_CHECKSUM_KEY'),
    maxRetries: 1,
    timeout: 20_000,
  }) as unknown as PayOSLike;
  return client;
};

export default class PaymentGatewayService {
  private notices = new NotificationDispatchService();

  // The payment link for what the order must pay upfront; an open link for the same amount is reused.
  async createLink(userId: number, orderId: number, locale = 'vi') {
    const order = await OrderModel.findOne({ where: { id: orderId, userId } });
    if (!order) throw HttpError.notFound();
    if (!order.paymentPlan || order.status !== 'PROCESSING')
      throw HttpError.conflict('This order has no payment to make online.');
    if (order.prepaidVnd >= order.upfrontDueVnd && order.prepaidVnd > 0)
      throw HttpError.conflict('The upfront payment is already received.', 'ALREADY_PAID');
    const amountVnd = order.upfrontDueVnd;
    const open = await OrderPaymentLinkModel.findOne({
      where: { orderId, status: 'PENDING', amountVnd, expiresAt: { [Op.gt]: new Date(Date.now() + 2 * 60_000) } },
      order: [['id', 'DESC']],
    });
    if (open?.checkoutUrl) return { checkoutUrl: open.checkoutUrl, amountVnd, expiresAt: open.expiresAt };
    const attempts = await OrderPaymentLinkModel.count({ where: { orderId } });
    if (attempts >= 50) throw HttpError.conflict('Too many payment attempts for this order. Contact the shop.');
    // Unique per payOS channel: the order id with a two-digit attempt counter.
    const providerOrderCode = orderId * 100 + attempts + 1;
    const expiresAt = new Date(Date.now() + LINK_MINUTES() * 60_000);
    const user = await UserModel.findByPk(userId, { attributes: ['email', 'firstName', 'lastName'] });
    const back = (outcome: string) =>
      `${shopPublicUrl()}/${locale === 'en' ? 'en' : 'vi'}/thank-you?orderId=${orderId}&payment=${outcome}`;
    const link = await OrderPaymentLinkModel.create({
      orderId,
      provider: 'payos',
      providerOrderCode,
      amountVnd,
      expiresAt,
      status: 'PENDING',
    });
    try {
      const created = await payos().paymentRequests.create({
        orderCode: providerOrderCode,
        amount: amountVnd,
        // At most 9 characters without a payOS-linked account: the same memo staff use for manual transfers.
        description: transferMemo(orderId).slice(0, 9),
        returnUrl: back('return'),
        cancelUrl: back('cancel'),
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
        buyerName: order.recipientName,
        buyerPhone: order.phone,
        buyerEmail: user?.email || undefined,
        items: [{ name: `Đơn hàng ${transferMemo(orderId)}`, quantity: 1, price: amountVnd }],
      });
      await link.update({ paymentLinkId: created.paymentLinkId, checkoutUrl: created.checkoutUrl });
      return { checkoutUrl: created.checkoutUrl, amountVnd, expiresAt };
    } catch (error) {
      await link.update({ status: 'FAILED' });
      Logger.ERROR(`payOS link for order ${orderId} failed:`, error);
      throw HttpError.serviceUnavailable(
        'The payment page could not be opened. Please try again.',
        'PAYMENT_UNAVAILABLE',
      );
    }
  }

  // payOS webhook: signature verified by the SDK; unknown order codes (payOS's own test call) are acknowledged.
  async webhook(body: unknown) {
    let data;
    try {
      data = await payos().webhooks.verify(body);
    } catch {
      throw HttpError.unauthorized('Invalid payment signature.');
    }
    if (data.code !== '00') return { recorded: false };
    const link = await OrderPaymentLinkModel.findOne({ where: { providerOrderCode: data.orderCode } });
    if (!link) return { recorded: false };
    await this.settle(link.id, data.amount, data.reference);
    return { recorded: true };
  }

  // Asks payOS for the status of the order's open links (the return page, and staff). Settles a confirmed payment.
  async sync(orderId: number, userId: number, admin = false) {
    const order = await OrderModel.findOne({ where: { id: orderId, ...(admin ? {} : { userId }) } });
    if (!order) throw HttpError.notFound();
    const links = await OrderPaymentLinkModel.findAll({
      where: { orderId, status: { [Op.in]: ['PENDING', 'PROCESSING', 'UNDERPAID'] } },
      order: [['id', 'ASC']],
    });
    for (const link of links) {
      try {
        const remote = await payos().paymentRequests.get(link.providerOrderCode);
        if (remote.status === 'PAID') {
          const reference = remote.transactions[0]?.reference || `LINK${link.providerOrderCode}`;
          await this.settle(link.id, remote.amountPaid, reference);
        } else if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(remote.status))
          await link.update({ status: remote.status as 'CANCELLED' });
      } catch (error) {
        Logger.WARN(`payOS status for link ${link.providerOrderCode} unavailable: ${(error as Error).message}`);
      }
    }
    const fresh = await OrderModel.findByPk(orderId);
    return {
      orderId,
      paid: !!fresh && fresh.prepaidVnd >= fresh.upfrontDueVnd && fresh.prepaidVnd > 0,
      prepaidVnd: fresh?.prepaidVnd ?? 0,
      upfrontDueVnd: fresh?.upfrontDueVnd ?? 0,
      onlinePayment: paymentsEnabled(),
    };
  }

  // Records a provider-confirmed payment exactly once: as the order's upfront receipt, or as a top-up when a receipt
  // already exists. Money that cannot be applied (cancelled order, wrong amount) alerts staff for a refund.
  private async settle(linkId: number, amountVnd: number, reference: string) {
    const externalReference = `PAYOS-${reference}`
      .toUpperCase()
      .replace(/[^A-Z0-9:_.-]/g, '')
      .slice(0, 128);
    let orderId = 0,
      applied = false,
      problem: string | null = null;
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const link = await OrderPaymentLinkModel.findByPk(linkId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!link || link.status === 'PAID') return;
      orderId = link.orderId;
      const order = await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) return;
      await link.update(
        {
          status: amountVnd >= link.amountVnd ? 'PAID' : 'UNDERPAID',
          paidAt: new Date(),
          reference: externalReference,
        },
        { transaction },
      );
      if (amountVnd < link.amountVnd) {
        problem = `Khách chuyển ${amountVnd} VND, thiếu so với ${link.amountVnd} VND.`;
        return;
      }
      const hasReceipt = order.prepaidVnd > 0;
      try {
        await new OrderService().recordProviderPrepayment(
          orderId,
          order.userId,
          {
            kind: hasReceipt ? 'topup' : 'receipt',
            amountVnd: Math.min(amountVnd, order.total - order.prepaidVnd),
            externalReference,
            reason: `payOS verified payment, link ${link.providerOrderCode}`,
            moneyVerified: true,
          },
          'payos',
          transaction,
        );
        applied = true;
      } catch (error) {
        problem = `Không ghi nhận được khoản payOS ${externalReference}: ${(error as Error).message}`;
      }
    });
    if (problem && orderId) {
      await this.notices.alertAdmins({
        kind: 'payment_problem',
        orderId,
        dedupeKey: `order:${orderId}:payos-problem:${externalReference}`,
        title: 'MODEL universe – THANH TOÁN ONLINE CẦN KIỂM TRA',
        content: `Mã đơn: ${transferMemo(orderId)}\n${problem}\nKiểm tra và hoàn tiền nếu cần.\nXem đơn: ${adminOrderUrl(orderId)}`,
      });
    }
    this.notices.dispatchSoon();
    if (applied) OrderService.afterUpfrontPayment(orderId);
  }
}
