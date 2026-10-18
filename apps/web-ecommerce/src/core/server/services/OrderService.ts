import LoyaltyService from './LoyaltyService';
import Logger from '../../../shared/server/utils/logger';
import MoneyReferenceService from './MoneyReferenceService';
import { validateShipping } from '../../../shared/server/utils/ShippingValidation';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { createHash, randomInt } from 'crypto';
import OrderModel, { OrderStatus } from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import OrderReceiptModel from '../database/client/models/OrderReceipt.Model';
import OrderPrepaymentModel, { type OrderPrepaymentKind } from '../database/client/models/OrderPrepayment.Model';
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
import { isPaymentPlan, minimumDepositVnd, transferMemo, upfrontDueVnd } from '../../../shared/payment';
import OrderShipmentModel from '../database/client/models/OrderShipment.Model';
import OrderShipmentEventModel from '../database/client/models/OrderShipmentEvent.Model';
import {
  ACTIVE_SHIPMENT_STATUSES,
  isFulfillmentMethod,
  MEETING_SLOTS,
  vnDate,
  type OrderMeeting,
} from '../../../shared/fulfillment';
import { couponPricingLines, assertVoucherBudget, voucherEvaluation } from './VoucherService';
import NotificationDispatchService from './NotificationDispatchService';
import ShippingService from './ShippingService';
import { ghnCodLimitVnd } from './delivery/GhnClient';
import FulfillmentNotices from './delivery/FulfillmentNotices';

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
    // Every new order is paid upfront by bank transfer: in full, or a deposit of at least 10% (src/shared/payment.ts).
    const paymentPlan = data.paymentPlan;
    if (!isPaymentPlan(paymentPlan))
      throw HttpError.badRequest(
        'Choose a deposit of at least 10% or full payment.',
        undefined,
        'PAYMENT_PLAN_REQUIRED',
      );
    const depositVnd = paymentPlan === 'deposit' ? data.depositVnd : undefined;
    // How the order is received (docs/business/deposit-delivery-specification.md): GHN delivery with the balance as COD,
    // or an in-person handover ("GDTT") at a place and time the shop confirms.
    // API callers that send neither keep the earlier contract: no carrier integration, staff ship it by hand.
    const fulfillmentMethod = data.fulfillmentMethod ?? (data.deliveryAddress !== undefined ? 'COURIER_COD' : null);
    if (fulfillmentMethod !== null && !isFulfillmentMethod(fulfillmentMethod))
      throw HttpError.badRequest('Choose GHN delivery or an in-person handover.', undefined, 'FULFILLMENT_REQUIRED');
    const meetingRequest =
      fulfillmentMethod === 'DIRECT_MEETING' ? validateMeetingRequest(data.meeting, shipping) : null;
    // GHN: a two-level address checked against GHN's master data; the shop pays GHN and the quoted fee is part of the
    // order total, so the COD is simply what the order still owes.
    const deliveryAddress =
      fulfillmentMethod === 'COURIER_COD' ? await new ShippingService().validateAddress(data.deliveryAddress) : null;
    if (deliveryAddress)
      Object.assign(shipping, {
        address: deliveryAddress.street,
        ward: deliveryAddress.wardName,
        district: null,
        city: deliveryAddress.provinceName,
      });
    const shippingFeePayer = fulfillmentMethod === 'COURIER_COD' ? 'shop' : null;
    const checkoutDigest = createHash('sha256')
      .update(
        JSON.stringify({
          items,
          shipping,
          couponCode,
          expectedTotal: data.expectedTotal,
          useMemberDiscount,
          paymentPlan,
          depositVnd,
          fulfillmentMethod,
          meetingRequest,
          deliveryAddress,
        }),
      )
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
    // The GHN fee for this parcel, quoted before the order transaction (an external call never holds row locks). The
    // COD value used for the quote is the merchandise at today's prices; the customer confirmed this total.
    let shippingFee = 0;
    if (deliveryAddress) {
      const preview = await this.cartService.resolveLines(items);
      const merchandise = preview.lines.reduce((sum, line) => sum + line.lineTotal, 0);
      shippingFee = (
        await new ShippingService().quote({
          units: items.reduce((sum, item) => sum + item.quantity, 0),
          address: deliveryAddress,
          recipientName: shipping.recipientName,
          phone: shipping.phone,
          codAmountVnd: merchandise,
          orderValueVnd: merchandise,
        })
      ).feeVnd;
    }

    let orderId: number;
    try {
      orderId = await DatabaseProvider.getInstance().transaction(async (transaction) => {
        const { lines, products } = await this.cartService.resolveLines(items, { transaction, lock: true });
        if ([...products.values()].some((product) => product.partnerId))
          throw HttpError.conflict(
            'Partner merchandise requires accepted seller shipping and the marketplace payment workflow.',
            'MARKETPLACE_CHECKOUT_REQUIRED',
          );
        const problems = lines.filter((line) => line.status !== 'OK');
        if (problems.length > 0) {
          throw HttpError.badRequest(
            'Một số sản phẩm trong giỏ hàng không còn hợp lệ, vui lòng kiểm tra lại giỏ hàng.',
            problems.map((line) => `${line.product?.name || `Sản phẩm #${line.productId}`}: ${line.message}`),
          );
        }

        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const eligibleProductIds = lines.filter((line) => !line.product?.partnerId).map((line) => line.productId);
        const benefitSubtotalVnd = lines
          .filter((line) => !line.product?.partnerId)
          .reduce((sum, line) => sum + line.lineTotal, 0);
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
              partnerId: line.product!.partnerId,
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
            benefitSubtotalVnd,
            userId,
          );
          const pricingLines = couponPricingLines(lines, products);
          discount = couponDiscount(coupon, pricingLines);
          assertVoucherBudget(coupon, discount);
          if (coupon.budgetVnd !== null && coupon.budgetVnd !== undefined)
            await coupon.increment('budgetUsedVnd', { by: discount, transaction });
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
          if (!benefitSnapshot)
            benefitSnapshot = {
              kind: 'coupon',
              couponCode: coupon.code,
              discountPercent: coupon.discountPercent,
              maxDiscountVnd: coupon.maxDiscountVnd ?? null,
              profitGuard: coupon.profitGuard,
              // The voucher terms and profit check exactly as applied; later edits never change this order.
              ...(coupon.profitGuard ? { evaluation: voucherEvaluation(coupon, pricingLines) } : {}),
            };
        }
        if (benefitSnapshot)
          benefitSnapshot = {
            ...benefitSnapshot,
            scope: 'shop_owned',
            basisVnd: benefitSubtotalVnd,
            eligibleProductIds,
            discountVnd: discount,
          };

        if (data.expectedTotal !== undefined && data.expectedTotal !== subtotal - discount + shippingFee + TAX) {
          throw HttpError.conflict('The price changed. Review and confirm the latest quote.', 'PRICE_CHANGED');
        }
        const total = subtotal - discount + shippingFee + TAX;
        // The minimum deposit is 10% of the merchandise after the voucher; the shipping fee is paid with the rest.
        const merchandiseVnd = subtotal - discount;
        // GHN collects at most the shop's COD limit on delivery; the rest must be paid upfront.
        const codFloor = deliveryAddress ? Math.max(0, total - ghnCodLimitVnd()) : 0;
        const upfrontDue = upfrontDueVnd(paymentPlan, total, depositVnd, merchandiseVnd, codFloor);
        if (upfrontDue === null)
          throw HttpError.badRequest(
            `The deposit must be a whole VND amount from ${Math.min(total, Math.max(minimumDepositVnd(merchandiseVnd), codFloor))} to ${total}.`,
            undefined,
            'DEPOSIT_INVALID',
          );
        const estimatedShippingFeeVnd = shippingFee;
        const meeting: OrderMeeting | null = meetingRequest
          ? {
              status: 'WAITING_FOR_APPOINTMENT',
              requested: meetingRequest,
              changeRequest: null,
              confirmedAddress: null,
              confirmedAt: null,
              confirmedByUserId: null,
              handoverAt: null,
              handoverByUserId: null,
              history: [
                {
                  at: new Date().toISOString(),
                  actorUserId: userId,
                  action: 'requested',
                  details: { ...meetingRequest },
                },
              ],
            }
          : null;
        const order = await OrderModel.create(
          {
            userId,
            fulfillmentMethod,
            shippingFeePayer,
            estimatedShippingFeeVnd,
            provinceId: deliveryAddress?.provinceId ?? null,
            wardId: deliveryAddress?.wardId ?? null,
            latitude: deliveryAddress?.latitude ?? null,
            longitude: deliveryAddress?.longitude ?? null,
            meeting,
            handoverCode: meeting ? String(randomInt(100000, 1000000)) : null,
            checkoutKey: checkoutKey || null,
            checkoutDigest: checkoutKey ? checkoutDigest : null,
            status: 'PROCESSING',
            paymentMethod: 'COD',
            paymentStatus: 'PENDING',
            paymentPlan,
            upfrontDueVnd: upfrontDue,
            // A full transfer settles the order; a deposit leaves the balance to COD on delivery.
            paymentSource: upfrontDue === total ? 'BANK_TRANSFER' : 'TRANSFER_PLUS_COD',
            requiresCollectionConfirmation: true,
            subtotal,
            discount,
            shippingFee,
            tax: TAX,
            total,
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
                partnerId: product.partnerId,
                listingVersion: product.listingVersion,
                shopBenefitEligible: !product.partnerId,
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
    const page = await OrderModel.findAndCountAll({
      where: { userId },
      include: [itemsInclude],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    for (const order of page.rows) {
      order.setDataValue('transferInstructions', this.transferInstructions(order));
      order.setDataValue('shipments', await this.shipments(order.id));
    }
    return page;
  }

  async getForUser(userId: number, orderId: number) {
    const order = await OrderModel.findOne({ where: { id: orderId, userId }, include: [itemsInclude] });
    if (!order) throw HttpError.notFound('Không tìm thấy đơn hàng.');
    order.setDataValue('transferInstructions', this.transferInstructions(order));
    order.setDataValue('shipments', await this.shipments(orderId));
    order.setDataValue(
      'prepayments',
      await OrderPrepaymentModel.findAll({
        where: { orderId },
        attributes: ['id', 'kind', 'amountVnd', 'createdAt'],
        order: [['id', 'ASC']],
      }),
    );
    return order;
  }

  async shipments(orderId: number) {
    const rows = await OrderShipmentModel.findAll({
      where: { orderId },
      order: [['id', 'ASC']],
      attributes: { exclude: ['requestKey', 'createdByUserId'] },
    });
    const events = await OrderShipmentEventModel.findAll({
      where: { shipmentId: rows.map((row) => row.id) },
      attributes: ['id', 'shipmentId', 'status', 'applied', 'reason', 'createdAt'],
      order: [['id', 'ASC']],
    });
    return rows.map((row) => ({
      ...row.get({ plain: true }),
      events: events.filter((event) => event.shipmentId === row.id),
    }));
  }

  // Where and how much to transfer while an order's upfront payment is outstanding; null otherwise. The receiving
  // account comes from SHOP_BANK_* (web only); without it the customer is told the shop will send the details.
  private transferInstructions(order: OrderModel) {
    if (!order.paymentPlan || order.status !== 'PROCESSING' || order.prepaidVnd >= order.upfrontDueVnd) return null;
    const bankName = process.env.SHOP_BANK_NAME?.trim(),
      accountNumber = process.env.SHOP_BANK_ACCOUNT?.trim(),
      accountHolder = process.env.SHOP_BANK_HOLDER?.trim();
    return {
      amountVnd: order.upfrontDueVnd - order.prepaidVnd,
      memo: transferMemo(order.id),
      account: bankName && accountNumber && accountHolder ? { bankName, accountNumber, accountHolder } : null,
    };
  }

  // Records a verified upfront transfer (`receipt`) for a checkout payment plan, or its refund after a prepaid order
  // was cancelled. Append-only; one of each per order; the bank reference is unique across every money ledger.
  // A payment the provider verified (payOS webhook or a server-side status check) instead of staff, for the order's
  // own customer, inside the provider settlement's transaction.
  async recordProviderPrepayment(
    orderId: number,
    customerId: number,
    data: Record<string, unknown>,
    provider: string,
    transaction: Transaction,
  ) {
    await this.applyPrepayment(orderId, customerId, data, { provider, transaction });
  }

  async recordPrepayment(orderId: number, actorUserId: number, data: Record<string, unknown>) {
    await this.applyPrepayment(orderId, actorUserId, data, {});
    new NotificationDispatchService().dispatchSoon();
    if (data.kind !== 'refund') OrderService.afterUpfrontPayment(orderId);
    return this.getAdmin(orderId);
  }

  private async applyPrepayment(
    orderId: number,
    actorUserId: number,
    data: Record<string, unknown>,
    options: { provider?: string; transaction?: Transaction },
  ) {
    const kind = data.kind as OrderPrepaymentKind;
    const externalReference = asTrimmedString(data.externalReference).toUpperCase();
    const reason = asTrimmedString(data.reason),
      amountVnd = data.amountVnd;
    if (
      !['receipt', 'topup', 'refund'].includes(kind) ||
      !/^[A-Z0-9:_.-]{8,128}$/.test(externalReference) ||
      !reason ||
      reason.length > 1000 ||
      data.moneyVerified !== true ||
      typeof amountVnd !== 'number' ||
      !Number.isSafeInteger(amountVnd) ||
      amountVnd < 1
    )
      throw HttpError.badRequest('Verify the actual transfer amount, bank reference and reason.');
    const work = async (transaction: Transaction) => {
      if (!options.provider) {
        const actor = await UserModel.findByPk(actorUserId, { transaction });
        if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
      }
      await MoneyReferenceService.lock(externalReference, 'order_prepayment', transaction);
      const order = await OrderModel.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw HttpError.notFound();
      if (options.provider && order.userId !== actorUserId) throw HttpError.forbidden();
      const existing = await OrderPrepaymentModel.findOne({ where: { externalReference }, transaction });
      if (existing) {
        if (existing.orderId !== orderId || existing.kind !== kind || existing.amountVnd !== amountVnd)
          throw HttpError.conflict('This bank reference belongs to another transfer.', 'PAYMENT_REFERENCE_REUSED');
        return;
      }
      if (!order.paymentPlan) throw HttpError.conflict('This order has no checkout payment plan.');
      if (kind !== 'topup' && (await OrderPrepaymentModel.findOne({ where: { orderId, kind }, transaction })))
        throw HttpError.conflict(
          kind === 'receipt' ? 'The upfront transfer is already recorded.' : 'The refund is already recorded.',
        );
      if (kind === 'topup') {
        // An additional verified transfer before the waybill exists; the COD is computed from it when the waybill is
        // created. After a waybill, the carrier's COD is fixed (open decision 8: no top-ups after a waybill).
        if (order.status !== 'PROCESSING' || order.prepaidVnd < order.upfrontDueVnd || order.prepaidVnd < 1)
          throw HttpError.conflict('Record the upfront transfer first; top-ups are possible only before shipping.');
        if (
          await OrderShipmentModel.findOne({
            where: { orderId, status: ACTIVE_SHIPMENT_STATUSES as unknown as string[] },
            transaction,
          })
        )
          throw HttpError.conflict(
            'The waybill already fixes the COD amount; collect the balance on delivery.',
            'WAYBILL_EXISTS',
          );
        if (order.prepaidVnd + amountVnd > order.total)
          throw HttpError.conflict(
            `The top-up can be at most ${order.total - order.prepaidVnd} VND.`,
            'PREPAYMENT_AMOUNT',
          );
        const prepaidVnd = order.prepaidVnd + amountVnd,
          settled = prepaidVnd === order.total;
        await order.update(
          {
            prepaidVnd,
            paymentSource: settled ? 'BANK_TRANSFER' : 'TRANSFER_PLUS_COD',
            ...(settled ? { paymentStatus: 'PAID', requiresCollectionConfirmation: false } : {}),
          },
          { transaction },
        );
      } else if (kind === 'receipt') {
        if (order.status !== 'PROCESSING')
          throw HttpError.conflict('Only an order awaiting shipment can receive its upfront transfer.');
        if (amountVnd < order.upfrontDueVnd || amountVnd > order.total)
          throw HttpError.conflict(
            `The verified transfer must be between ${order.upfrontDueVnd} and ${order.total} VND.`,
            'PREPAYMENT_AMOUNT',
          );
        const settled = amountVnd === order.total;
        await order.update(
          {
            prepaidVnd: amountVnd,
            paymentSource: settled ? 'BANK_TRANSFER' : 'TRANSFER_PLUS_COD',
            // A full transfer settles the order: no COD to collect on delivery.
            ...(settled ? { paymentStatus: 'PAID', requiresCollectionConfirmation: false } : {}),
          },
          { transaction },
        );
      } else {
        if (order.status !== 'CANCELLED' || order.prepaidVnd < 1)
          throw HttpError.conflict('Only a cancelled order with a verified transfer can be refunded.');
        if (amountVnd !== order.prepaidVnd)
          throw HttpError.conflict('The refund must equal the verified transfer.', 'PREPAYMENT_AMOUNT');
      }
      await OrderPrepaymentModel.create(
        { orderId, actorUserId, kind, amountVnd, externalReference, reason },
        { transaction },
      );
      // The order is confirmed once its deposit is verified: tell the shop (Zalo/admin alert) and the customer.
      if (kind === 'receipt') await new FulfillmentNotices().depositConfirmed(order, transaction);
    };
    if (options.transaction) await work(options.transaction);
    else await DatabaseProvider.getInstance().transaction(work);
  }

  // Once the deposit or full payment is verified, the GHN order is created automatically (FulfillmentService decides
  // whether it applies). Runs after the commit; a failure only raises an admin alert.
  static afterUpfrontPayment(orderId: number) {
    // Required lazily: FulfillmentService itself depends on OrderService.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { default: FulfillmentService } = require('./FulfillmentService') as typeof import('./FulfillmentService');
    void new FulfillmentService()
      .autoCreateShipment(orderId)
      .catch((error: unknown) => Logger.ERROR(`Automatic waybill for order ${orderId} failed:`, error));
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
      if (order.discount > 0)
        await CouponModel.decrement('budgetUsedVnd', {
          by: order.discount,
          where: { code: order.couponCode, budgetVnd: { [Op.ne]: null }, budgetUsedVnd: { [Op.gte]: order.discount } },
          transaction,
        });
    }
  }

  // Also used by FulfillmentService (carrier events, in-person handover) inside its own transaction.
  async changeStatus(order: OrderModel, nextStatus: OrderStatus, transaction: Transaction, actorUserId?: number) {
    if (!TRANSITIONS[order.status].includes(nextStatus)) {
      throw HttpError.badRequest(
        `Không thể chuyển đơn hàng từ "${STATUS_LABELS[order.status]}" sang "${STATUS_LABELS[nextStatus]}".`,
      );
    }
    // A checkout payment plan ships only after its deposit or full transfer is verified.
    if (nextStatus === 'SHIPPED' && order.paymentPlan && order.prepaidVnd < order.upfrontDueVnd)
      throw HttpError.conflict(
        'Verify the customer’s upfront transfer before shipping this order.',
        'PREPAYMENT_REQUIRED',
      );
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
      // Received money needs a verified refund, which only staff can record.
      if (order.paymentPlan && order.prepaidVnd > 0)
        throw HttpError.conflict(
          'Đơn đã nhận tiền chuyển khoản. Vui lòng liên hệ cửa hàng để huỷ và hoàn tiền.',
          'PREPAID_ORDER_CANCEL',
        );
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
    order.setDataValue(
      'prepayments',
      await OrderPrepaymentModel.findAll({ where: { orderId }, order: [['id', 'ASC']] }),
    );
    order.setDataValue('transferInstructions', this.transferInstructions(order));
    order.setDataValue('shipments', await this.shipments(orderId));
    order.setDataValue('notifications', await new NotificationDispatchService().listForOrder(orderId));
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
      await this.recordCollection(order, actorUserId, { amountVnd, externalReference, reason }, transaction);
    });
    return this.getAdmin(orderId);
  }

  // The verified remaining balance of a delivered (or handed-over) order: one append-only receipt, then settlement.
  async recordCollection(
    order: OrderModel,
    actorUserId: number,
    { amountVnd, externalReference, reason }: { amountVnd: number; externalReference: string; reason: string },
    transaction: Transaction,
  ) {
    const orderId = order.id;
    {
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
    }
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

// The in-person handover the customer asks for: place, Vietnam business date (today or later, within 60 days) and slot.
export const validateMeetingRequest = (raw: unknown, shipping: { address: string; city: string }) => {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const date = asTrimmedString(value.date),
    slot = asTrimmedString(value.slot),
    note = asTrimmedString(value.note) || null;
  const today = vnDate(),
    latest = vnDate(new Date(Date.now() + 60 * 86_400_000));
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > latest)
    errors.push('Choose a handover date from today up to 60 days ahead.');
  if (!(MEETING_SLOTS as readonly string[]).includes(slot)) errors.push('Choose a handover time slot.');
  if ((note?.length || 0) > 500) errors.push('The handover note may be at most 500 characters.');
  if (errors.length)
    throw HttpError.badRequest('Thông tin giao dịch trực tiếp chưa hợp lệ.', errors, 'MEETING_INVALID');
  return { address: shipping.address, city: shipping.city, date, slot: slot as (typeof MEETING_SLOTS)[number], note };
};
