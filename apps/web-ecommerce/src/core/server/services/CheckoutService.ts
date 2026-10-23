import { createHash } from 'crypto';
import { Op } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import CheckoutSessionModel from '../database/client/models/CheckoutSession.Model';
import OrderPaymentLinkModel from '../database/client/models/OrderPaymentLink.Model';
import ProductModel from '../database/client/models/Product.Model';
import type { Transaction } from 'sequelize';
import { normalizeCartItems } from './CartService';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import { isPaymentPlan } from '../../../shared/payment';
import { formatVND } from '../../../shared/server/utils/utils';
import type { Attribution } from '../../../shared/server/utils/AttributionUtils';
import type { ConsentChoice } from '../../../shared/server/utils/ConsentUtils';
import type { DeliveryAddress } from '../../../shared/fulfillment';
import OrderService from './OrderService';
import PaymentGatewayService from './PaymentGatewayService';
import { paymentLinkMinutes, paymentsEnabled } from './PaymentConfig';
import NotificationDispatchService from './NotificationDispatchService';
import CustomerAddressService from './CustomerAddressService';

const REQUEST_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
// payOS is asked about an open session at most this often while the customer's QR dialog polls.
const SYNC_INTERVAL_MS = 3_000;

// Canonical JSON (sorted keys): the stored payload is JSONB, which does not keep the key order.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

// Online checkout (payOS): the order exists only once its upfront payment is confirmed. A checkout session holds the
// validated request, the totals and the carrier fee the customer saw, and a VietQR payment link valid for
// PAYOS_LINK_MINUTES (30 by default). The customer may switch between a deposit and full payment (a new QR) or cancel.
// When payOS confirms the money (webhook or status check) the order is placed with exactly that request, the payment is
// recorded on it and the waybill follows automatically. While the QR is open the stock is held for the customer (as
// large marketplaces do for orders awaiting payment) and given back when the session expires, is cancelled or fails;
// a customer has one open checkout at a time. A payment arriving after the stock was given back becomes the order only
// if the stock is still there; otherwise the session becomes FAILED and staff refund the payment.
export default class CheckoutService {
  private orders = new OrderService();
  private payments = new PaymentGatewayService();
  private notices = new NotificationDispatchService();

  private async view(session: CheckoutSessionModel) {
    const link = await OrderPaymentLinkModel.findOne({
      where: { checkoutSessionId: session.id, status: { [Op.in]: ['PENDING', 'PROCESSING', 'PAID'] } },
      order: [['id', 'DESC']],
    });
    const quote = session.shippingQuote;
    // A short transfer to the latest QR: staff refund it; the customer pays again with a new QR.
    const underpaid =
      session.status === 'OPEN' && !link
        ? await OrderPaymentLinkModel.findOne({
            where: { checkoutSessionId: session.id, status: 'UNDERPAID' },
            order: [['id', 'DESC']],
          })
        : null;
    return {
      underpaid: underpaid ? { amountVnd: underpaid.amountVnd, reference: underpaid.reference } : null,
      id: session.id,
      status: session.status,
      orderId: session.orderId,
      totalVnd: session.totalVnd,
      upfrontDueVnd: session.upfrontDueVnd,
      depositAmountVnd: session.depositAmountVnd || session.upfrontDueVnd,
      balanceVnd: session.totalVnd - session.upfrontDueVnd,
      paymentPlan: session.paymentPlan,
      depositVnd: session.depositVnd,
      expiresAt: session.expiresAt,
      serverTime: new Date(),
      shipping: quote
        ? { feeVnd: quote.feeVnd, carrierName: quote.carrier?.carrierName ?? null, source: quote.source }
        : null,
      payment:
        link && session.status === 'OPEN'
          ? {
              amountVnd: link.amountVnd,
              qrCode: link.qrCode,
              checkoutUrl: link.checkoutUrl,
              bankBin: link.bankBin,
              accountNumber: link.accountNumber,
              accountName: link.accountName,
              description: link.description,
            }
          : null,
    };
  }

  private request(data: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { requestKey, ...request } = data;
    return request;
  }

  private async owned(userId: number, sessionId: number) {
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) throw HttpError.notFound();
    const session = await CheckoutSessionModel.findOne({ where: { id: sessionId, userId } });
    if (!session) throw HttpError.notFound();
    return session;
  }

  private async buyer(userId: number, payload: Record<string, unknown>) {
    const user = await UserModel.findByPk(userId, { attributes: ['email'] });
    const shipping = (payload.shipping || {}) as Record<string, string>;
    return { name: shipping.recipientName || '', phone: shipping.phone || '', email: user?.email || null };
  }

  // Validates the order request exactly as placing it would (prices, stock, voucher, carrier fee, deposit), then opens
  // the QR payment. The same request key returns the same open session.
  async create(
    userId: number,
    data: Record<string, unknown>,
    locale = 'vi',
    attribution: Attribution | null = null,
    consent: ConsentChoice | null = null,
  ) {
    if (!paymentsEnabled())
      throw HttpError.serviceUnavailable('Online payment is not configured.', 'PAYMENT_UNAVAILABLE');
    const requestKey = data.requestKey;
    if (typeof requestKey !== 'string' || !REQUEST_KEY.test(requestKey))
      throw HttpError.badRequest('Invalid checkout request reference.');
    // The signed cart quote is checked once, here; the session is the quote from then on (its own payment deadline),
    // so it is not stored and a later payment never fails on the quote's age.
    const { quoteId, ...request } = this.request(data);
    const existing = await CheckoutSessionModel.findOne({ where: { userId, requestKey } });
    if (existing) {
      if (digest(existing.payload) !== digest(request))
        throw HttpError.conflict('This checkout reference was already used for a different order request.');
      await this.refresh(existing);
      return this.view(existing);
    }
    const preview = await this.orders.previewOrder(userId, quoteId === undefined ? request : { ...request, quoteId });
    // One open checkout per customer: an earlier one is cancelled and its stock given back.
    for (const earlier of await CheckoutSessionModel.findAll({ where: { userId, status: 'OPEN' } })) {
      await this.payments.cancelSessionLinks(earlier.id, 'Replaced by a new checkout');
      await earlier.update({ status: 'CANCELLED', failureReason: 'replaced by a new checkout' });
      await this.releaseHold(earlier.id);
    }
    const session = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const holds = await this.holdStock(request.items, transaction);
      return CheckoutSessionModel.create(
        {
          userId,
          requestKey,
          payload: request,
          shippingQuote: preview.shippingQuote,
          attribution: attribution as Record<string, unknown> | null,
          consent: consent as unknown as Record<string, unknown> | null,
          paymentPlan: request.paymentPlan,
          depositVnd: request.paymentPlan === 'deposit' ? preview.upfrontDue : null,
          totalVnd: preview.total,
          upfrontDueVnd: preview.upfrontDue,
          depositAmountVnd: preview.depositDue,
          status: 'OPEN',
          expiresAt: new Date(Date.now() + paymentLinkMinutes() * 60_000),
          stockHolds: holds,
        },
        { transaction },
      );
    });
    try {
      await this.payments.createSessionLink(session, await this.buyer(userId, request), locale);
    } catch (error) {
      await session.update({ status: 'CANCELLED', failureReason: 'payment link unavailable' });
      await this.releaseHold(session.id);
      throw error;
    }
    return this.view(session);
  }

  // Takes the checkout's quantities out of stock (locked rows); refused when the stock is not there any more.
  private async holdStock(rawItems: unknown, transaction: Transaction) {
    const quantities = new Map<number, number>();
    for (const item of normalizeCartItems(rawItems))
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    const holds: { productId: number; quantity: number }[] = [];
    for (const [productId, quantity] of [...quantities].sort(([a], [b]) => a - b)) {
      const product = await ProductModel.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product || product.stock < quantity)
        throw HttpError.conflict(
          `${product?.name || `Sản phẩm #${productId}`} vừa hết hàng hoặc không đủ số lượng.`,
          'OUT_OF_STOCK',
        );
      await product.update({ stock: product.stock - quantity }, { transaction });
      holds.push({ productId, quantity });
    }
    return holds;
  }

  // Gives the held stock back, once (expired, cancelled, failed, or handed to the order inside its transaction).
  private async releaseHold(sessionId: number, given?: Transaction) {
    const work = async (transaction: Transaction) => {
      const session = await CheckoutSessionModel.findByPk(sessionId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!session?.stockHolds?.length || session.holdReleasedAt) return;
      for (const hold of [...session.stockHolds].sort((a, b) => a.productId - b.productId)) {
        const product = await ProductModel.findByPk(hold.productId, { transaction, lock: transaction.LOCK.UPDATE });
        if (product) await product.update({ stock: product.stock + hold.quantity }, { transaction });
      }
      await session.update({ holdReleasedAt: new Date() }, { transaction });
    };
    if (given) await work(given);
    else await DatabaseProvider.getInstance().transaction(work);
  }

  // The customer's checkouts still waiting for their QR payment (shown on the orders page, no new payment is made).
  async listOpen(userId: number) {
    const sessions = await CheckoutSessionModel.findAll({
      where: { userId, status: { [Op.in]: ['OPEN', 'PAID'] } },
      order: [['id', 'DESC']],
      limit: 5,
    });
    const views = [];
    for (const session of sessions) {
      await this.refresh(session);
      if (session.status === 'OPEN' || session.status === 'PAID') views.push(await this.view(session));
    }
    return views;
  }

  // The QR dialog polls this: payOS is asked about the payment, an unpaid session past its time expires.
  async get(userId: number, sessionId: number) {
    const session = await this.owned(userId, sessionId);
    await this.refresh(session);
    return this.view(session);
  }

  // The background sync (OrderSyncService): the same check as when the customer's dialog polls.
  async reconcile(session: CheckoutSessionModel) {
    await this.refresh(session);
  }

  private async refresh(session: CheckoutSessionModel) {
    if (
      session.status === 'OPEN' &&
      (!session.lastCheckedAt || Date.now() - session.lastCheckedAt.getTime() >= SYNC_INTERVAL_MS)
    ) {
      await session.update({ lastCheckedAt: new Date() });
      await this.payments.syncSession(session.id);
      await session.reload();
    }
    if (session.status === 'OPEN' && session.expiresAt.getTime() <= Date.now()) {
      await this.payments.cancelSessionLinks(session.id, 'Checkout expired');
      await session.update({ status: 'EXPIRED' });
      await this.releaseHold(session.id);
    }
    // A confirmed payment whose order creation was interrupted is completed now.
    if (session.status === 'PAID') {
      await this.complete(session.id);
      await session.reload();
    }
  }

  // Deposit ↔ full payment (or another deposit level) while the QR is open: totals are checked again and a new QR with
  // a fresh countdown replaces the old one, which is cancelled at payOS.
  async changePlan(userId: number, sessionId: number, data: Record<string, unknown>, locale = 'vi') {
    const session = await this.owned(userId, sessionId);
    await this.refresh(session);
    if (session.status !== 'OPEN')
      throw HttpError.conflict('This checkout is no longer waiting for payment.', 'CHECKOUT_CLOSED');
    if (!isPaymentPlan(data.paymentPlan))
      throw HttpError.badRequest(
        'Choose a deposit of at least 10% or full payment.',
        undefined,
        'PAYMENT_PLAN_REQUIRED',
      );
    const request = {
      ...session.payload,
      paymentPlan: data.paymentPlan,
      depositVnd: data.paymentPlan === 'deposit' ? data.depositVnd : undefined,
    };
    const preview = await this.orders.previewOrder(userId, request, session.shippingQuote, (transaction) =>
      this.releaseHold(session.id, transaction),
    );
    await this.payments.cancelSessionLinks(session.id, 'Payment method changed');
    await session.update({
      payload: request,
      paymentPlan: request.paymentPlan,
      depositVnd: request.paymentPlan === 'deposit' ? preview.upfrontDue : null,
      totalVnd: preview.total,
      upfrontDueVnd: preview.upfrontDue,
      depositAmountVnd: preview.depositDue,
      expiresAt: new Date(Date.now() + paymentLinkMinutes() * 60_000),
    });
    await this.payments.createSessionLink(session, await this.buyer(userId, request), locale);
    return this.view(session);
  }

  async cancel(userId: number, sessionId: number) {
    const session = await this.owned(userId, sessionId);
    await this.refresh(session);
    if (session.status === 'OPEN') {
      await this.payments.cancelSessionLinks(session.id, 'Cancelled by the customer');
      await session.update({ status: 'CANCELLED' });
      await this.releaseHold(session.id);
    }
    return this.view(session);
  }

  // payOS confirmed money for a session link (webhook or status check): recorded once, then the order is created.
  async settlePayment(linkId: number, amountVnd: number, reference: string) {
    const externalReference = `PAYOS-${reference}`
      .toUpperCase()
      .replace(/[^A-Z0-9:_.-]/g, '')
      .slice(0, 128);
    let sessionId = 0,
      problem: string | null = null;
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const link = await OrderPaymentLinkModel.findByPk(linkId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!link?.checkoutSessionId || link.status === 'PAID' || link.status === 'UNDERPAID') return;
      const session = await CheckoutSessionModel.findByPk(link.checkoutSessionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!session) return;
      sessionId = session.id;
      const paid = amountVnd >= link.amountVnd;
      await link.update(
        { status: paid ? 'PAID' : 'UNDERPAID', paidAt: new Date(), reference: externalReference },
        { transaction },
      );
      if (!paid) {
        problem = `Khách chuyển ${formatVND(amountVnd, 'vi')}, thiếu so với ${formatVND(link.amountVnd, 'vi')}.`;
        return;
      }
      if (session.status === 'PAID' || session.status === 'COMPLETED') {
        // A second payment for the same checkout (e.g. two QR codes paid): refund it.
        problem = `Phiên thanh toán MUC${session.id} đã được thanh toán trước đó; khoản ${externalReference} cần hoàn lại.`;
        return;
      }
      // Money that arrives after the countdown (or after cancelling) still becomes the order the customer paid for.
      await session.update(
        {
          status: 'PAID',
          paidVnd: amountVnd,
          paymentReference: externalReference,
          upfrontDueVnd: link.amountVnd,
          paymentPlan: link.amountVnd >= session.totalVnd ? 'full' : 'deposit',
          depositVnd: link.amountVnd >= session.totalVnd ? null : link.amountVnd,
        },
        { transaction },
      );
    });
    if (problem && sessionId) await this.alert(sessionId, problem, externalReference);
    if (sessionId && !problem) await this.complete(sessionId);
  }

  private async alert(sessionId: number, problem: string, reference: string, orderId: number | null = null) {
    await this.notices.alertAdmins({
      kind: 'payment_problem',
      orderId,
      dedupeKey: `checkout:${sessionId}:problem:${reference}`,
      title: 'MODEL universe – THANH TOÁN ONLINE CẦN KIỂM TRA',
      content: `Phiên thanh toán: MUC${sessionId}\n${problem}\nKiểm tra và hoàn tiền nếu cần.`,
    });
    this.notices.dispatchSoon();
  }

  // Places the paid session's order (idempotent through its checkout key), records the payment on it, saves the
  // address to the customer's address book and lets the waybill be created.
  async complete(sessionId: number) {
    const session = await CheckoutSessionModel.findByPk(sessionId);
    if (!session || session.status !== 'PAID' || !session.paymentReference) return;
    const request: Record<string, unknown> = {
      ...session.payload,
      requestKey: `checkout-session-${session.id}`,
      paymentPlan: session.paymentPlan,
      depositVnd: session.paymentPlan === 'deposit' ? session.upfrontDueVnd : undefined,
    };
    let orderId: number;
    try {
      const order = await this.orders.placeOrder(
        session.userId,
        request,
        session.attribution as Attribution | null,
        session.consent as unknown as ConsentChoice | null,
        // The order takes over the stock this checkout held, in the same transaction.
        {
          shippingQuote: session.shippingQuote,
          beforeLines: (transaction) => this.releaseHold(session.id, transaction),
        },
      );
      orderId = order.id;
    } catch (error) {
      const reason = (error as Error).message;
      Logger.WARN(`Paid checkout ${session.id} could not become an order: ${reason}`);
      await session.update({ status: 'FAILED', failureReason: reason.slice(0, 1000) });
      await this.releaseHold(session.id);
      await this.alert(
        session.id,
        `Khách đã thanh toán ${formatVND(session.paidVnd, 'vi')} nhưng không tạo được đơn: ${reason}`,
        session.paymentReference,
      );
      return;
    }
    await OrderPaymentLinkModel.update({ orderId }, { where: { checkoutSessionId: session.id, status: 'PAID' } });
    try {
      await DatabaseProvider.getInstance().transaction((transaction) =>
        this.orders.recordProviderPrepayment(
          orderId,
          session.userId,
          {
            kind: 'receipt',
            amountVnd: Math.min(session.paidVnd, session.totalVnd),
            externalReference: session.paymentReference,
            reason: `payOS verified payment, checkout MUC${session.id}`,
            moneyVerified: true,
          },
          'payos',
          transaction,
        ),
      );
    } catch (error) {
      await this.alert(
        session.id,
        `Đơn #${orderId} đã tạo nhưng chưa ghi nhận được khoản ${session.paymentReference}: ${(error as Error).message}`,
        session.paymentReference,
        orderId,
      );
    }
    await session.update({ status: 'COMPLETED', orderId });
    this.notices.dispatchSoon();
    OrderService.afterUpfrontPayment(orderId);
    const address = request.deliveryAddress as DeliveryAddress | undefined;
    if (address)
      await new CustomerAddressService()
        .remember(session.userId, request.shipping as Record<string, string>, address)
        .catch((error: unknown) => Logger.WARN(`Address book update failed: ${(error as Error).message}`));
  }
}
