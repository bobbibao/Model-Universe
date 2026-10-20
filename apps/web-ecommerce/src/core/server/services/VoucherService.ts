import { Op, Transaction } from 'sequelize';
import VoucherClaimModel from '../database/client/models/VoucherClaim.Model';
import { evaluateStack } from '../../../shared/promotions';
import { BENEFIT_MESSAGES, prepaidVoucher } from './PromotionService';
import DatabaseProvider from '../database/Database.Provider';
import CouponModel from '../database/client/models/Coupon.Model';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { formatVND } from '../../../shared/server/utils/utils';
import {
  bestVoucher,
  cartProfit,
  DEFAULT_RULES,
  evaluateVoucher,
  listPriceForMemberPrice,
  memberPrice,
  PRICING_RULE_VERSION,
  STANDARD_MEMBER_PERCENT,
  voucherLimits,
  type PricingLine,
} from '../../../shared/pricing';
import { resaleCandidates } from '../../../shared/buyback-pricing';
import CartService, { normalizeCartItems, type CartLine } from './CartService';
import { assertCouponUsable, couponDiscount, isSmartCoupon, toPricingLines, voucherTerms, type PricedLine } from './CouponService';
import NotificationDispatchService from './NotificationDispatchService';
import { emailVoucherExpiring } from './delivery/Messages';

const VN_OFFSET_MS = 7 * 3600_000;
export const REMINDER_HOURS = [72, 24] as const;

// Cart lines as the voucher rules see them: list price charged, quantity, SKU and actual cost.
export const couponPricingLines = (lines: CartLine[], products: Map<number, ProductModel>): PricedLine[] =>
  lines
    .filter((line) => line.status === 'OK' && line.product)
    .map((line) => {
      const product = products.get(line.productId);
      return {
        productId: line.productId,
        sku: product?.sku ?? '',
        costVnd: product?.importPrice ?? 0,
        listPrice: line.product!.price,
        salePrice: line.product!.salePrice,
        managedSale: line.product!.managedSale,
        partnerId: line.product!.partnerId,
        quantity: line.quantity,
      };
    });

export const voucherEvaluation = (coupon: CouponModel, lines: PricedLine[]) =>
  evaluateVoucher({ ...voucherTerms(coupon), ...(lines.some((line) => line.managedSale) ? { profitGuard: true } : {}) }, toPricingLines(lines.filter((line) => !line.partnerId)));

export const assertVoucherBudget = (coupon: CouponModel, discountVnd: number) => {
  if (coupon.budgetVnd !== null && coupon.budgetVnd !== undefined && coupon.budgetUsedVnd + discountVnd > coupon.budgetVnd)
    throw HttpError.conflict('Chương trình khuyến mãi không còn đủ ngân sách cho đơn này.', 'VOUCHER_BUDGET');
};

// End of the current month in Vietnam, as an instant.
export const endOfVnMonth = (now: Date) => {
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - VN_OFFSET_MS - 1);
};
export const vnMonthKey = (now: Date) => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(2, 7).replace('-', '');

const walletFields = [
  'id', 'code', 'title', 'description', 'discountPercent', 'fixedAmountVnd', 'maxDiscountVnd', 'minOrderVnd', 'startDate',
  'expirationDate', 'kind', 'source', 'cartType', 'profitGuard', 'eligibleSkus', 'excludedSkus', 'usageLimit', 'usageCount',
  'usedAt', 'reservedOrderId', 'benefitType', 'maxShippingVnd', 'minTier',
] as const;

// The customer's voucher wallet, the monthly member code, best-voucher selection, add-on suggestions that unlock a
// better voucher, expiry reminders, and the admin pricing calculator/simulation (docs/business/pricing-voucher-specification.md).
export default class VoucherService {
  private cart = new CartService();

  private now() {
    return new Date();
  }

  private async activeTemplate(transaction?: Transaction) {
    const now = this.now();
    return CouponModel.findOne({
      where: { kind: 'member_template', isActive: true, startDate: { [Op.lte]: now }, expirationDate: { [Op.gte]: now } },
      order: [['id', 'DESC']],
      transaction,
    });
  }

  // Usable codes the customer may choose from: their own (member, loyalty) and the public ones, valid now.
  private async usable(userId: number) {
    const now = this.now();
    const rows = await CouponModel.findAll({
      where: {
        isActive: true,
        startDate: { [Op.lte]: now },
        expirationDate: { [Op.gte]: now },
        kind: { [Op.ne]: 'member_template' },
        // Own codes, public codes, and voucher drops the customer saved.
        [Op.or]: [
          { ownerUserId: userId },
          { isPublic: true, ownerUserId: null, requiresClaim: false },
          {
            requiresClaim: true,
            id: (await VoucherClaimModel.findAll({ where: { userId }, attributes: ['couponId'] })).map((claim) => claim.couponId),
          },
        ],
      },
      order: [['expirationDate', 'ASC'], ['id', 'ASC']],
    });
    return rows.filter(
      (coupon) =>
        !coupon.usedAt &&
        !coupon.reservedOrderId &&
        (coupon.usageLimit === null || coupon.usageLimit === undefined || coupon.usageCount < coupon.usageLimit) &&
        (coupon.budgetVnd === null || coupon.budgetVnd === undefined || coupon.budgetUsedVnd < coupon.budgetVnd),
    );
  }

  async wallet(userId: number) {
    const user = await UserModel.findByPk(userId);
    if (!user?.isActive) throw HttpError.forbidden();
    const template = await this.activeTemplate();
    const monthCode = template ? `M${vnMonthKey(this.now())}-${userId}` : null;
    const claimed = monthCode ? await CouponModel.findOne({ where: { code: monthCode } }) : null;
    const coupons = await this.usable(userId);
    return {
      ruleVersion: PRICING_RULE_VERSION,
      vouchers: coupons.map((coupon) => {
        const plain = coupon.get({ plain: true }) as Record<string, unknown>;
        return Object.fromEntries(walletFields.map((field) => [field, plain[field] ?? null]));
      }),
      monthly: template
        ? {
            available: !claimed,
            code: claimed?.code ?? null,
            discountPercent: template.discountPercent,
            minOrderVnd: template.minOrderVnd,
            maxDiscountVnd: template.maxDiscountVnd ?? null,
            expiresAt: endOfVnMonth(this.now()).toISOString(),
          }
        : null,
    };
  }

  // Issues this month's member code from the active template, once per member per month (a copy: later template edits
  // never change an issued code).
  async claimMonthly(userId: number) {
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.isActive || user.role !== 'USER') throw HttpError.forbidden('Only customer accounts receive member vouchers.');
      const template = await this.activeTemplate(transaction);
      if (!template) throw HttpError.conflict('No member voucher is offered this month.', 'MEMBER_VOUCHER_UNAVAILABLE');
      const now = this.now(), code = `M${vnMonthKey(now)}-${userId}`;
      if (await CouponModel.findOne({ where: { code }, transaction })) return;
      const expirationDate = new Date(Math.min(endOfVnMonth(now).getTime(), new Date(template.expirationDate).getTime()));
      await CouponModel.create(
        {
          code,
          title: template.title,
          description: template.description,
          discountPercent: template.discountPercent,
          usageLimit: 1,
          startDate: now,
          expirationDate,
          isActive: true,
          minOrderVnd: template.minOrderVnd,
          source: 'member',
          kind: 'member',
          ownerUserId: userId,
          templateId: template.id,
          profitGuard: template.profitGuard,
          maxDiscountVnd: template.maxDiscountVnd,
          eligibleSkus: template.eligibleSkus,
          excludedSkus: template.excludedSkus,
          cartType: template.cartType,
          policySnapshot: { ruleVersion: PRICING_RULE_VERSION, templateId: template.id, issuedAt: now.toISOString() },
        },
        { transaction },
      );
    });
    return this.wallet(userId);
  }

  private async pricedCart(rawItems: unknown) {
    const { lines, products } = await this.cart.resolveLines(normalizeCartItems(rawItems));
    return { lines, products, priced: couponPricingLines(lines, products) };
  }

  // Every usable voucher evaluated on the cart with the same profit guard as checkout (src/shared/promotions.ts): the
  // best discount code and the best free-shipping code (against the quoted shipping fee) are proposed.
  async evaluateCart(userId: number, rawItems: unknown, shippingFeeVnd = 0) {
    const { priced } = await this.pricedCart(rawItems);
    const coupons = await this.usable(userId);
    const lines = toPricingLines(priced);
    const shopSubtotal = priced.reduce((sum, line) => sum + (line.partnerId ? 0 : line.salePrice * line.quantity), 0);
    const options = coupons.map((coupon) => {
      const freeship = coupon.benefitType === 'freeship';
      let discountVnd = 0, reason: string | null = null;
      try {
        assertCouponUsable(coupon, shopSubtotal, userId);
        const stack = evaluateStack({
          lines,
          shippingFeeVnd,
          voucher: freeship || prepaidVoucher(coupon) ? null : voucherTerms(coupon),
          approvedVoucherVnd: !freeship && prepaidVoucher(coupon) ? couponDiscount(coupon, priced) : null,
          freeship: freeship ? { minOrderVnd: coupon.minOrderVnd, maxShippingVnd: coupon.maxShippingVnd ?? 0 } : null,
        });
        const refusal = freeship ? stack.freeshipRefusal : stack.voucherRefusal;
        if (refusal) reason = BENEFIT_MESSAGES[refusal];
        else discountVnd = freeship ? stack.shippingDiscountVnd : stack.voucherDiscountVnd;
      } catch (error) {
        reason = (error as Error).message;
      }
      return {
        code: coupon.code,
        title: coupon.title,
        benefitType: coupon.benefitType,
        discountPercent: coupon.discountPercent,
        maxDiscountVnd: coupon.maxDiscountVnd ?? null,
        maxShippingVnd: coupon.maxShippingVnd ?? null,
        minOrderVnd: coupon.minOrderVnd,
        expiresAt: coupon.expirationDate,
        discountVnd,
        eligible: !reason && discountVnd > 0,
        reason,
      };
    });
    const pick = (type: string) =>
      options.filter((option) => option.eligible && option.benefitType === type).sort((a, b) => b.discountVnd - a.discountVnd)[0] ?? null;
    return { ruleVersion: PRICING_RULE_VERSION, options, best: pick('discount'), bestFreeship: pick('freeship') };
  }

  // Add-on suggestions (chapter VIII): in-stock shop products that unlock a better voucher the customer owns while the
  // shop keeps at least 78% of the basket's standard profit, earns more than on the current cart, and the minimum
  // profit. Never adds anything to the cart.
  async suggestAddOns(userId: number, rawItems: unknown) {
    const { lines, products, priced } = await this.pricedCart(rawItems);
    const shopLines = priced.filter((line) => !line.partnerId);
    if (!shopLines.length || lines.some((line) => line.status !== 'OK')) return { suggestions: [] };
    const coupons = (await this.usable(userId)).filter(isSmartCoupon);
    if (!coupons.length) return { suggestions: [] };
    const pricingLines = toPricingLines(shopLines);
    const current = bestVoucher(coupons.map((coupon) => ({ voucher: coupon, terms: voucherTerms(coupon) })), pricingLines);
    const currentDiscount = current?.evaluation.discountVnd ?? 0;
    const originalProfit = cartProfit(pricingLines, currentDiscount);
    const inCart = new Set(shopLines.map((line) => line.productId));
    const cartProducts = [...inCart].map((id) => products.get(id as number)).filter(Boolean) as ProductModel[];
    const series = new Set(cartProducts.map((product) => product.series).filter(Boolean));
    const grades = new Set(cartProducts.map((product) => product.grade).filter(Boolean));
    const candidates = (
      await ProductModel.findAll({
        where: { id: { [Op.notIn]: [...inCart] }, partnerId: null, stock: { [Op.gt]: 0 }, importPrice: { [Op.gt]: 0 } },
        order: [['sold', 'DESC'], ['id', 'ASC']],
        limit: 200,
      })
    ).filter(isSellable);
    const pricing = await this.cart.resolveLines(candidates.map((product) => ({ productId: product.id, size: product.availableSizes?.[0] ?? '', quantity: 1 })));
    const suggestions = [];
    for (const line of pricing.lines) {
      if (line.status !== 'OK' || !line.product) continue;
      const product = pricing.products.get(line.productId)!;
      const addOn: PricingLine = { productId: product.id, sku: product.sku, unitPriceVnd: line.product.salePrice, ...(line.product.managedSale ? { referenceListPriceVnd: product.price } : {}), quantity: 1, unitCostVnd: product.importPrice };
      const next = [...pricingLines, addOn];
      const unlocked = bestVoucher(coupons.map((coupon) => ({ voucher: coupon, terms: voucherTerms(coupon) })), next);
      if (!unlocked) continue;
      // A voucher the current cart could not use, or one that now saves more than before.
      const unlocks = unlocked.voucher.code !== current?.voucher.code || unlocked.evaluation.discountVnd > currentDiscount;
      const newProfit = cartProfit(next, unlocked.evaluation.discountVnd);
      if (!unlocks || newProfit < originalProfit || newProfit < DEFAULT_RULES.minimumProfitVnd) continue;
      const regularNow = pricingLines.reduce((sum, item) => sum + item.unitPriceVnd * item.quantity, 0);
      const compatible = (product.series && series.has(product.series)) || (product.grade && grades.has(product.grade));
      suggestions.push({
        product: { id: product.id, name: product.name, imageUrl: product.imageUrl, priceVnd: addOn.unitPriceVnd, series: product.series ?? null, grade: product.grade ?? null },
        compatible: !!compatible,
        currentVoucher: current ? { code: current.voucher.code, discountVnd: currentDiscount } : null,
        unlockedVoucher: { code: unlocked.voucher.code, title: unlocked.voucher.title, discountPercent: unlocked.voucher.discountPercent, maxDiscountVnd: unlocked.voucher.maxDiscountVnd ?? null, discountVnd: unlocked.evaluation.discountVnd },
        currentCartPayableVnd: regularNow - currentDiscount,
        newCartPayableVnd: regularNow + addOn.unitPriceVnd - unlocked.evaluation.discountVnd,
        additionalPaymentVnd: addOn.unitPriceVnd - (unlocked.evaluation.discountVnd - currentDiscount),
        extraDiscountVnd: unlocked.evaluation.discountVnd - currentDiscount,
        incrementalProfitVnd: newProfit - originalProfit,
      });
    }
    // Ranking: compatible first, then extra shop profit, then the smallest extra spend.
    suggestions.sort(
      (a, b) =>
        Number(b.compatible) - Number(a.compatible) ||
        b.incrementalProfitVnd - a.incrementalProfitVnd ||
        a.additionalPaymentVnd - b.additionalPaymentVnd,
    );
    return { suggestions: suggestions.slice(0, 3) };
  }

  // Reminders 72 h and 24 h before an owned voucher expires (website + email), once each; never for used codes.
  async runExpiryReminders(now = new Date()) {
    const horizon = new Date(now.getTime() + REMINDER_HOURS[0] * 3600_000);
    const rows = await CouponModel.findAll({
      where: {
        ownerUserId: { [Op.ne]: null },
        isActive: true,
        usedAt: null,
        reservedOrderId: null,
        expirationDate: { [Op.gt]: now, [Op.lte]: horizon },
      },
      limit: 500,
      order: [['id', 'ASC']],
    });
    const notices = new NotificationDispatchService();
    let created = 0;
    for (const candidate of rows) {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        const coupon = await CouponModel.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!coupon || coupon.usedAt || coupon.reservedOrderId || (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit)) return;
        const hoursLeft = (new Date(coupon.expirationDate).getTime() - now.getTime()) / 3600_000;
        const due = REMINDER_HOURS.filter((hours) => hoursLeft <= hours && !(coupon.remindersSent || []).includes(hours));
        if (!due.length) return;
        const user = await UserModel.findByPk(coupon.ownerUserId!, { transaction });
        if (!user?.isActive) return;
        const hours = Math.min(...due);
        const description = coupon.maxDiscountVnd
          ? `Giảm ${coupon.discountPercent}%, tối đa ${formatVND(coupon.maxDiscountVnd)}`
          : coupon.fixedAmountVnd
            ? `Giảm ${formatVND(coupon.fixedAmountVnd)}`
            : `Giảm ${coupon.discountPercent}%`;
        const expireAt = new Date(coupon.expirationDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        await notices.notifyCustomer(
          {
            userId: user.id,
            kind: 'voucher_expiring',
            entityId: coupon.id,
            dedupeKey: `voucher-expiry:${coupon.id}:${hours}`,
            details: { code: coupon.code, description, expiresAt: new Date(coupon.expirationDate).toISOString(), hours },
            email: emailVoucherExpiring(`${user.lastName} ${user.firstName}`.trim(), coupon.code, description, expireAt),
          },
          transaction,
        );
        // Both thresholds are settled once the nearer one is sent (a 24 h reminder replaces a missed 72 h one).
        await coupon.update({ remindersSent: [...new Set([...(coupon.remindersSent || []), ...due])] }, { transaction });
        created++;
      });
    }
    if (created) notices.dispatchSoon();
    return created;
  }

  // Admin calculator (chapter XIV): every number the rules use, for one product or basket.
  calculate(data: Record<string, unknown>) {
    const whole = (value: unknown, field: string, min = 0) => {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > 2_000_000_000)
        throw HttpError.badRequest(`Provide ${field} as whole VND.`);
      return value;
    };
    const result: Record<string, unknown> = { ruleVersion: PRICING_RULE_VERSION };
    if (data.buybackVnd !== undefined) result.resaleCandidates = resaleCandidates(whole(data.buybackVnd, 'the buyback price', 1));
    if (data.targetMemberVnd !== undefined) {
      const targetMemberVnd = whole(data.targetMemberVnd, 'the target member price', 1);
      const listPriceVnd = listPriceForMemberPrice(targetMemberVnd);
      result.memberPrice = { targetMemberVnd, listPriceVnd, memberPriceVnd: memberPrice(listPriceVnd), percent: STANDARD_MEMBER_PERCENT };
      if (data.costVnd !== undefined)
        result.limits = voucherLimits({ targetMemberVnd, costVnd: whole(data.costVnd, 'the cost'), basket: data.basket === true });
    }
    if (data.listPriceVnd !== undefined) {
      const listPriceVnd = whole(data.listPriceVnd, 'the list price', 1);
      result.fromList = { listPriceVnd, memberPriceVnd: memberPrice(listPriceVnd) };
    }
    return result;
  }

  // Simulates a voucher on every shop-owned product in stock as a single-product cart (chapter XII §41).
  async simulate(couponId: number) {
    const coupon = await CouponModel.findByPk(couponId);
    if (!coupon) throw HttpError.notFound();
    const terms = { ...voucherTerms(coupon), minOrderVnd: 0 };
    const products = (await ProductModel.findAll({ where: { partnerId: null, stock: { [Op.gt]: 0 } }, limit: 2000, order: [['id', 'ASC']] })).filter(isSellable);
    const { lines } = await this.cart.resolveLines(products.map((product) => ({ productId: product.id, size: product.availableSizes?.[0] ?? '', quantity: 1 })));
    const byId = new Map(products.map((product) => [product.id, product]));
    let eligible = 0, discountTotal = 0, profitTotal = 0, baselineTotal = 0, betterThanStandard = 0;
    const refusals: Record<string, number> = {};
    const samples: Record<string, unknown>[] = [];
    for (const line of lines) {
      if (line.status !== 'OK' || !line.product) continue;
      const product = byId.get(line.productId)!;
      const pricingLine: PricingLine = { productId: product.id, sku: product.sku, unitPriceVnd: line.product.salePrice, ...(line.product.managedSale ? { referenceListPriceVnd: product.price } : {}), quantity: 1, unitCostVnd: product.importPrice };
      const evaluation = evaluateVoucher({ ...terms, profitGuard: true }, [pricingLine]);
      const standard = evaluateVoucher({ discountPercent: STANDARD_MEMBER_PERCENT, profitGuard: true }, [pricingLine]);
      if (!evaluation.eligible) {
        refusals[evaluation.refusal!] = (refusals[evaluation.refusal!] || 0) + 1;
        continue;
      }
      eligible++;
      discountTotal += evaluation.discountVnd;
      profitTotal += evaluation.actualProfitVnd;
      baselineTotal += evaluation.baselineProfitVnd;
      if (evaluation.discountVnd > (standard.eligible ? standard.discountVnd : 0)) betterThanStandard++;
      if (samples.length < 10) samples.push({ sku: product.sku, name: product.name, priceVnd: line.product.salePrice, costVnd: product.importPrice, discountVnd: evaluation.discountVnd, profitVnd: evaluation.actualProfitVnd, lossBasisPoints: evaluation.actualLossBasisPoints });
    }
    const evaluated = eligible + Object.values(refusals).reduce((sum, value) => sum + value, 0);
    return {
      ruleVersion: PRICING_RULE_VERSION,
      coupon: { id: coupon.id, code: coupon.code, discountPercent: coupon.discountPercent, maxDiscountVnd: coupon.maxDiscountVnd ?? null },
      evaluated,
      eligible,
      ineligible: evaluated - eligible,
      refusals,
      averageDiscountVnd: eligible ? Math.round(discountTotal / eligible) : 0,
      totalDiscountIfEachSoldOnceVnd: discountTotal,
      profitAfterDiscountVnd: profitTotal,
      profitLossBasisPoints: baselineTotal > 0 ? Math.round(((baselineTotal - profitTotal) * 10_000) / baselineTotal) : 0,
      betterThanStandardCount: betterThanStandard,
      budgetVnd: coupon.budgetVnd ?? null,
      // Do not offer a high voucher catalog-wide when most products cannot meet its conditions.
      recommendCatalogWide: evaluated > 0 && eligible * 2 >= evaluated,
      samples,
    };
  }
}
