import { PayOS } from '@payos/node';
import { Op } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import OrderModel from '../database/client/models/Order.Model';
import OrderPaymentLinkModel from '../database/client/models/OrderPaymentLink.Model';
import type CheckoutSessionModel from '../database/client/models/CheckoutSession.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import { transferMemo } from '../../../shared/payment';
import { shopPublicUrl } from './marketing/platforms';
import NotificationDispatchService from './NotificationDispatchService';
import { adminOrderUrl } from './delivery/Messages';
import OrderService from './OrderService';
import { paymentLinkMinutes, paymentsEnabled } from './PaymentConfig';

export { paymentsEnabled };

// Online upfront payments with payOS (https://payos.vn/docs/api): a payment link (VietQR) for a deposit or full amount,
// of a checkout session (the order is created once the money arrives) or of an existing order. The money counts only
// when payOS confirms it, through its signed webhook or a server-side status check, never because the browser came back
// to the return URL. Credentials are web-only: PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY. Without them
// checkout keeps the verified manual bank transfer.

const env = (name: string) => process.env[name]?.trim() ?? '';
// payOS order codes: an order's links are orderId × 100 + attempt; a checkout session's are offset by 10^12.
const SESSION_CODE_OFFSET = 1_000_000_000_000;

// The subset of the SDK this service uses (replaced by a double in tests).
export interface PayOSLike {
  paymentRequests: {
    create(data: Record<string, unknown>): Promise<{
      checkoutUrl: string;
      paymentLinkId: string;
      status: string;
      qrCode?: string;
      bin?: string;
      accountNumber?: string;
      accountName?: string;
    }>;
    get(
      orderCode: number,
    ): Promise<{ status: string; amountPaid: number; transactions: { reference: string; amount: number }[] }>;
    cancel?(orderCode: number, cancellationReason?: string): Promise<unknown>;
  };
  webhooks: { verify(body: unknown): Promise<{ orderCode: number; amount: number; reference: string; code: string }> };
}

// Required lazily: CheckoutService itself depends on this service.
const checkoutService = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: CheckoutService } = require('./CheckoutService') as typeof import('./CheckoutService');
  return new CheckoutService();
};

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
    if (open?.checkoutUrl) return this.linkView(open);
    const attempts = await OrderPaymentLinkModel.count({ where: { orderId } });
    if (attempts >= 50) throw HttpError.conflict('Too many payment attempts for this order. Contact the shop.');
    // Unique per payOS channel: the order id with a two-digit attempt counter.
    const providerOrderCode = orderId * 100 + attempts + 1;
    const expiresAt = new Date(Date.now() + paymentLinkMinutes() * 60_000);
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
      await link.update(this.linkDetails(created, transferMemo(orderId).slice(0, 9)));
      return this.linkView(link);
    } catch (error) {
      await link.update({ status: 'FAILED' });
      Logger.ERROR(`payOS link for order ${orderId} failed:`, error);
      throw HttpError.serviceUnavailable(
        'The payment page could not be opened. Please try again.',
        'PAYMENT_UNAVAILABLE',
      );
    }
  }

  // What the order page shows for a payment link: the VietQR, the receiving account and the countdown.
  private linkView(link: OrderPaymentLinkModel) {
    return {
      checkoutUrl: link.checkoutUrl!,
      amountVnd: link.amountVnd,
      expiresAt: link.expiresAt,
      serverTime: new Date(),
      qrCode: link.qrCode,
      bankBin: link.bankBin,
      accountNumber: link.accountNumber,
      accountName: link.accountName,
      description: link.description,
    };
  }

  // The order's payment link that is still open, without creating one (viewing an order never starts a payment).
  async openLink(userId: number, orderId: number) {
    const order = await OrderModel.findOne({ where: { id: orderId, userId } });
    if (!order) throw HttpError.notFound();
    const link = await OrderPaymentLinkModel.findOne({
      where: {
        orderId,
        checkoutSessionId: null,
        status: 'PENDING',
        amountVnd: order.upfrontDueVnd - order.prepaidVnd > 0 ? order.upfrontDueVnd : -1,
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [['id', 'DESC']],
    });
    return { onlinePayment: paymentsEnabled(), link: link?.checkoutUrl ? this.linkView(link) : null };
  }

  private linkDetails(created: Awaited<ReturnType<PayOSLike['paymentRequests']['create']>>, description: string) {
    return {
      paymentLinkId: created.paymentLinkId,
      checkoutUrl: created.checkoutUrl,
      qrCode: created.qrCode || null,
      bankBin: created.bin || null,
      accountNumber: created.accountNumber || null,
      accountName: created.accountName || null,
      description,
    };
  }

  // A payment link for the checkout session's upfront amount, valid until the session expires.
  async createSessionLink(
    session: CheckoutSessionModel,
    buyer: { name: string; phone: string; email: string | null },
    locale = 'vi',
  ) {
    const attempts = await OrderPaymentLinkModel.count({ where: { checkoutSessionId: session.id } });
    if (attempts >= 99) throw HttpError.conflict('Too many payment attempts for this checkout. Start again.');
    const providerOrderCode = SESSION_CODE_OFFSET + session.id * 100 + attempts + 1;
    // At most 9 characters without a payOS-linked account.
    const description = `MUC${session.id}`.slice(0, 9);
    const back = (outcome: string) =>
      `${shopPublicUrl()}/${locale === 'en' ? 'en' : 'vi'}/thank-you?session=${session.id}&payment=${outcome}`;
    const link = await OrderPaymentLinkModel.create({
      orderId: null,
      checkoutSessionId: session.id,
      provider: 'payos',
      providerOrderCode,
      amountVnd: session.upfrontDueVnd,
      expiresAt: session.expiresAt,
      status: 'PENDING',
    });
    try {
      const created = await payos().paymentRequests.create({
        orderCode: providerOrderCode,
        amount: session.upfrontDueVnd,
        description,
        returnUrl: back('return'),
        cancelUrl: back('cancel'),
        expiredAt: Math.floor(session.expiresAt.getTime() / 1000),
        buyerName: buyer.name,
        buyerPhone: buyer.phone,
        buyerEmail: buyer.email || undefined,
        items: [{ name: `Thanh toán ${description}`, quantity: 1, price: session.upfrontDueVnd }],
      });
      await link.update(this.linkDetails(created, description));
      return link;
    } catch (error) {
      await link.update({ status: 'FAILED' });
      Logger.ERROR(`payOS link for checkout ${session.id} failed:`, error);
      throw HttpError.serviceUnavailable(
        'The payment QR could not be created. Please try again.',
        'PAYMENT_UNAVAILABLE',
      );
    }
  }

  // Asks payOS about the session's open links; a confirmed payment is settled (and the order created).
  async syncSession(sessionId: number) {
    const links = await OrderPaymentLinkModel.findAll({
      where: { checkoutSessionId: sessionId, status: { [Op.in]: ['PENDING', 'PROCESSING'] } },
      order: [['id', 'ASC']],
    });
    for (const link of links) {
      try {
        const remote = await payos().paymentRequests.get(link.providerOrderCode);
        if (remote.status === 'PAID') {
          const reference = remote.transactions[0]?.reference || `LINK${link.providerOrderCode}`;
          await checkoutService().settlePayment(link.id, remote.amountPaid, reference);
        } else if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(remote.status))
          await link.update({ status: remote.status as 'CANCELLED' });
      } catch (error) {
        Logger.WARN(`payOS status for link ${link.providerOrderCode} unavailable: ${(error as Error).message}`);
      }
    }
  }

  // Cancels the session's open links at payOS (best effort: an expired link cannot be paid anyway).
  async cancelSessionLinks(sessionId: number, reason: string) {
    const links = await OrderPaymentLinkModel.findAll({
      where: { checkoutSessionId: sessionId, status: { [Op.in]: ['PENDING', 'PROCESSING'] } },
    });
    for (const link of links) {
      try {
        await payos().paymentRequests.cancel?.(link.providerOrderCode, reason.slice(0, 100));
      } catch (error) {
        Logger.WARN(`payOS cancel of link ${link.providerOrderCode} failed: ${(error as Error).message}`);
      }
      await link.update({ status: 'CANCELLED' });
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
    if (link.checkoutSessionId) await checkoutService().settlePayment(link.id, data.amount, data.reference);
    else await this.settle(link.id, data.amount, data.reference);
    return { recorded: true };
  }

  // Asks payOS for the status of the order's open links (the return page, and staff). Settles a confirmed payment.
  async sync(orderId: number, userId: number, admin = false) {
    const order = await OrderModel.findOne({ where: { id: orderId, ...(admin ? {} : { userId }) } });
    if (!order) throw HttpError.notFound();
    const links = await OrderPaymentLinkModel.findAll({
      where: { orderId, checkoutSessionId: null, status: { [Op.in]: ['PENDING', 'PROCESSING', 'UNDERPAID'] } },
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
      if (!link || link.status === 'PAID' || !link.orderId) return;
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
