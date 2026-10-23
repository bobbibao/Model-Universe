import { Op, Transaction } from 'sequelize';
import VoucherClaimModel from '../database/client/models/VoucherClaim.Model';
import LoyaltyLedgerModel from '../database/client/models/LoyaltyLedger.Model';
import { evaluateCheckout } from '../../../shared/promotions';
import {
  appliedProfitVnd,
  DEFAULT_PROFIT_POLICY,
  evaluateStack,
  RANK_BENEFITS,
  rankBenefitFor,
  rankOptions,
  upsellAllowed,
  VOUCHER_RULE_VERSION,
  type MainVoucher,
  type ProfitPolicy,
  type RankBenefit,
  type StackLine,
} from '../../../shared/voucher-stack';
import { loyaltyBalances } from '../../../shared/loyalty-rules';
import { approvedVoucher, BENEFIT_MESSAGES, RANK_REFUSAL_MESSAGE } from './PromotionService';
import DatabaseProvider from '../database/Database.Provider';
import CouponModel from '../database/client/models/Coupon.Model';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { formatVND } from '../../../shared/server/utils/utils';
import {
  listPriceForMemberPrice,
  memberPrice,
  STANDARD_MEMBER_PERCENT,
  VOUCHER_MAX_PERCENT,
  VOUCHER_MIN_PERCENT,
} from '../../../shared/pricing';
import { resaleCandidates } from '../../../shared/buyback-pricing';
import CartService, { normalizeCartItems, type CartLine } from './CartService';
import {
  assertCouponUsable,
  couponDiscount,
  couponVoucher,
  toStackLines,
  type PricedLine,
} from './CouponService';
import NotificationDispatchService from './NotificationDispatchService';
import PricingApprovalService, { type EffectivePricing } from './PricingApprovalService';
import CommercePolicyService from './CommercePolicyService';
import { emailVoucherExpiring } from './delivery/Messages';
const VN_OFFSET_MS = 7 * 3600_000;
export const REMINDER_HOURS = [72, 24] as const;

// Cart lines as the voucher rules see them: list price charged, quantity, SKU and actual cost (the approved cost
// profile and approved R from PricingApprovalService when given, else the receipt price).
export const couponPricingLines = (
  lines: CartLine[],
  products: Map<number, ProductModel>,
  pricing?: ReadonlyMap<number, EffectivePricing>,
): PricedLine[] =>
  lines
    .filter((line) => line.status === 'OK' && line.product)
    .map((line) => {
      const product = products.get(line.productId);
      const effective = pricing?.get(line.productId);
      return {
        productId: line.productId,
        sku: product?.sku ?? '',
        costVnd: effective?.costVnd ?? product?.importPrice ?? 0,
        ...(effective ? { priceApproved: effective.priceApproved } : {}),
        listPrice: line.product!.price,
        salePrice: line.product!.salePrice,
        managedSale: line.product!.managedSale,
        partnerId: line.product!.partnerId,
        quantity: line.quantity,
      };
    });

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
  private pricing = new PricingApprovalService();
  private policies = new CommercePolicyService();

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
      ruleVersion: VOUCHER_RULE_VERSION,
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
          policySnapshot: { ruleVersion: VOUCHER_RULE_VERSION, templateId: template.id, issuedAt: now.toISOString() },
        },
        { transaction },
      );
    });
    return this.wallet(userId);
  }

  private async pricedCart(rawItems: unknown) {
    const { lines, products } = await this.cart.resolveLines(normalizeCartItems(rawItems));
    const { policy, pricing } = await this.pricing.context(products.values());
    return { lines, products, policy, pricing, priced: couponPricingLines(lines, products, pricing) };
  }

  // The customer's rank benefit (from lifetime points), which tops up one main voucher.
  private async rank(userId: number) {
    return rankBenefitFor(loyaltyBalances(await LoyaltyLedgerModel.findAll({ where: { userId } })).lifetime);
  }

  // One owned or public code on these lines under the checkout rules (src/shared/promotions.ts): its own discount, the
  // rank benefit it would carry, or why it does not apply.
  private evaluateCode(
    coupon: CouponModel,
    priced: PricedLine[],
    rank: RankBenefit | null,
    shippingFeeVnd: number,
    userId: number,
    policy: ProfitPolicy,
  ) {
    const shopSubtotal = priced.reduce((sum, line) => sum + (line.partnerId ? 0 : line.salePrice * line.quantity), 0);
    const freeship = coupon.benefitType === 'freeship';
    assertCouponUsable(coupon, shopSubtotal, userId);
    const approved = approvedVoucher(coupon);
    return evaluateCheckout({
      lines: toStackLines(priced),
      voucher: freeship || approved ? null : couponVoucher(coupon),
      approvedVoucher: !freeship && approved ? { code: coupon.code, discountVnd: couponDiscount(coupon, priced) } : null,
      rank: freeship || approved ? null : rank,
      freeship: freeship ? { minOrderVnd: coupon.minOrderVnd, maxShippingVnd: coupon.maxShippingVnd ?? 0 } : null,
      shippingFeeVnd,
      policy,
    });
  }

  // Every usable voucher evaluated on the cart with the checkout rules: its state (VOUCHER_INVALID, VOUCHER_ONLY_VALID,
  // STACK_VALID), what it takes off, the rank benefit it carries, and the public reason when it does not apply. The best
  // discount code (the customer pays least; ties: fewer points spent, then the earlier expiry) and the best
  // free-shipping code (against the quoted shipping fee) are proposed.
  async evaluateCart(userId: number, rawItems: unknown, shippingFeeVnd = 0) {
    const { priced, policy } = await this.pricedCart(rawItems);
    const coupons = await this.usable(userId);
    const rank = await this.rank(userId);
    const options = coupons.map((coupon) => {
      const freeship = coupon.benefitType === 'freeship';
      let discountVnd = 0,
        rankDiscountVnd = 0,
        reason: string | null = null,
        rankReason: string | null = null,
        status: string | null = null;
      try {
        const result = this.evaluateCode(coupon, priced, rank, shippingFeeVnd, userId, policy);
        const refusal = freeship ? result.freeshipRefusal : result.voucherRefusal;
        if (refusal) {
          reason = BENEFIT_MESSAGES[refusal];
          status = 'VOUCHER_INVALID';
        } else {
          discountVnd = freeship ? result.shippingDiscountVnd : result.voucherDiscountVnd;
          rankDiscountVnd = result.rankDiscountVnd;
          status = freeship ? null : (result.evaluation?.status ?? 'VOUCHER_ONLY_VALID');
          if (rank && !freeship && result.rankRefusal) rankReason = RANK_REFUSAL_MESSAGE;
        }
      } catch (error) {
        reason = (error as Error).message;
        status = freeship ? null : 'VOUCHER_INVALID';
      }
      return {
        code: coupon.code,
        title: coupon.title,
        benefitType: coupon.benefitType,
        source: coupon.source,
        discountPercent: coupon.discountPercent,
        fixedAmountVnd: coupon.fixedAmountVnd || null,
        maxDiscountVnd: coupon.maxDiscountVnd ?? null,
        maxShippingVnd: coupon.maxShippingVnd ?? null,
        minOrderVnd: coupon.minOrderVnd,
        expiresAt: coupon.expirationDate,
        status,
        discountVnd,
        rankDiscountVnd,
        rankReason,
        eligible: !reason && discountVnd + rankDiscountVnd > 0,
        reason,
      };
    });
    const best = options
      .filter((option) => option.eligible && option.benefitType !== 'freeship')
      .sort(
        (a, b) =>
          b.discountVnd + b.rankDiscountVnd - (a.discountVnd + a.rankDiscountVnd) ||
          Number(a.source === 'loyalty') - Number(b.source === 'loyalty') ||
          new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
      )[0] ?? null;
    const bestFreeship =
      options
        .filter((option) => option.eligible && option.benefitType === 'freeship')
        .sort((a, b) => b.discountVnd - a.discountVnd)[0] ?? null;
    return {
      ruleVersion: VOUCHER_RULE_VERSION,
      rank: rank ? { code: rank.code, tier: rank.tier, bps: rank.bps, capVnd: rank.capVnd } : null,
      options,
      best,
      bestFreeship,
    };
  }

  // Add-on suggestions: in-stock shop products that let a voucher the customer owns save more, only when the larger
  // basket passes the same profit checks on its own standard profit and leaves the shop at least the profit of the
  // current cart with its best option (BR-014). Never adds anything to the cart.
  async suggestAddOns(userId: number, rawItems: unknown) {
    const { lines, products, priced, policy } = await this.pricedCart(rawItems);
    const shopLines = priced.filter((line) => !line.partnerId);
    if (!shopLines.length || lines.some((line) => line.status !== 'OK')) return { suggestions: [] };
    const coupons = (await this.usable(userId)).filter(
      (coupon) => coupon.benefitType !== 'freeship' && !approvedVoucher(coupon),
    );
    if (!coupons.length) return { suggestions: [] };
    const rank = await this.rank(userId);
    const vouchers = coupons.map((coupon) => couponVoucher(coupon));
    const bestOn = (cart: PricedLine[]) => rankOptions({ lines: toStackLines(cart), vouchers, rank, policy })[0] ?? null;
    const saving = (option: ReturnType<typeof bestOn>) =>
      option ? option.evaluation.primaryDiscountVnd + option.evaluation.rankDiscountVnd : 0;
    const current = bestOn(shopLines);
    const currentSaving = saving(current);
    // The profit of the cart as it is: with its best option, or at the list price when no code applies.
    const originalProfit = current
      ? appliedProfitVnd(current.evaluation)
      : evaluateStack({
          lines: toStackLines(shopLines),
          voucher: { code: '', kind: 'FIXED', amountVnd: 0 },
          rank: null,
          policy,
        }).plainProfitVnd;
    const inCart = new Set(shopLines.map((line) => line.productId));
    const cartProducts = [...inCart].map((id) => products.get(id as number)).filter(Boolean) as ProductModel[];
    const series = new Set(cartProducts.map((product) => product.series).filter(Boolean));
    const grades = new Set(cartProducts.map((product) => product.grade).filter(Boolean));
    const candidates = (
      await ProductModel.findAll({
        where: { id: { [Op.notIn]: [...inCart] }, partnerId: null, stock: { [Op.gt]: 0 }, importPrice: { [Op.gt]: 0 } },
        order: [
          ['sold', 'DESC'],
          ['id', 'ASC'],
        ],
        limit: 200,
      })
    ).filter(isSellable);
    const pricing = await this.cart.resolveLines(
      candidates.map((product) => ({ productId: product.id, size: product.availableSizes?.[0] ?? '', quantity: 1 })),
    );
    const candidatePricing = (await this.pricing.context(candidates)).pricing;
    const regularNow = shopLines.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
    const suggestions = [];
    for (const line of pricing.lines) {
      if (line.status !== 'OK' || !line.product) continue;
      const product = pricing.products.get(line.productId)!;
      const addOn: PricedLine = {
        productId: product.id,
        sku: product.sku,
        listPrice: product.price,
        salePrice: line.product.salePrice,
        managedSale: line.product.managedSale,
        quantity: 1,
        costVnd: candidatePricing.get(product.id)!.costVnd,
        priceApproved: candidatePricing.get(product.id)!.priceApproved,
      };
      const unlocked = bestOn([...shopLines, addOn]);
      if (!unlocked) continue;
      const unlockedSaving = saving(unlocked);
      // A voucher the current cart could not use, or one that now saves more than before.
      const unlocks = unlocked.voucher.code !== current?.voucher.code || unlockedSaving > currentSaving;
      if (!unlocks || !upsellAllowed(originalProfit, unlocked.evaluation)) continue;
      const coupon = coupons.find((item) => item.code === unlocked.voucher.code)!;
      const compatible = (product.series && series.has(product.series)) || (product.grade && grades.has(product.grade));
      suggestions.push({
        product: {
          id: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          priceVnd: addOn.salePrice,
          series: product.series ?? null,
          grade: product.grade ?? null,
        },
        compatible: !!compatible,
        currentVoucher: current ? { code: current.voucher.code, discountVnd: currentSaving } : null,
        unlockedVoucher: {
          code: coupon.code,
          title: coupon.title,
          discountPercent: coupon.discountPercent,
          maxDiscountVnd: coupon.maxDiscountVnd ?? null,
          discountVnd: unlockedSaving,
          rankDiscountVnd: unlocked.evaluation.rankDiscountVnd,
        },
        currentCartPayableVnd: regularNow - currentSaving,
        newCartPayableVnd: regularNow + addOn.salePrice - unlockedSaving,
        additionalPaymentVnd: addOn.salePrice - (unlockedSaving - currentSaving),
        extraDiscountVnd: unlockedSaving - currentSaving,
        incrementalProfitVnd: appliedProfitVnd(unlocked.evaluation) - originalProfit,
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

  // Admin calculator: every number the rules use for one product. Under v6.2 the list price is the test assumption
  // R = ROUND(S / 0.9) (never a published price by itself), the standard profit L10 includes the point reserve, and each
  // percentage is checked alone (≥ 80% of L10, 50,000 VND, 5%) and with each rank benefit (≥ 75%).
  async calculate(data: Record<string, unknown>) {
    const whole = (value: unknown, field: string, min = 0) => {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > 2_000_000_000)
        throw HttpError.badRequest(`Provide ${field} as whole VND.`);
      return value;
    };
    const result: Record<string, unknown> = { ruleVersion: VOUCHER_RULE_VERSION };
    if (data.buybackVnd !== undefined)
      result.resaleCandidates = resaleCandidates(whole(data.buybackVnd, 'the buyback price', 1));
    if (data.targetMemberVnd !== undefined) {
      const targetMemberVnd = whole(data.targetMemberVnd, 'the target member price', 1);
      const listPriceVnd = listPriceForMemberPrice(targetMemberVnd);
      result.memberPrice = {
        targetMemberVnd,
        listPriceVnd,
        memberPriceVnd: memberPrice(listPriceVnd),
        percent: STANDARD_MEMBER_PERCENT,
      };
      if (data.costVnd !== undefined)
        result.limits = voucherLimitsV62(
          listPriceVnd,
          whole(data.costVnd, 'the cost', 1),
          (await this.policies.voucherPolicy()).policy,
        );
    }
    if (data.listPriceVnd !== undefined) {
      const listPriceVnd = whole(data.listPriceVnd, 'the list price', 1);
      result.fromList = { listPriceVnd, memberPriceVnd: memberPrice(listPriceVnd) };
    }
    return result;
  }

  // Simulates a voucher on every shop-owned product in stock as a single-product cart, alone and with the highest rank
  // benefit (Diamond), under the checkout rules v6.2.
  async simulate(couponId: number) {
    const coupon = await CouponModel.findByPk(couponId);
    if (!coupon) throw HttpError.notFound();
    const voucher = { ...couponVoucher(coupon), minimumOrderVnd: 0 };
    const diamond = RANK_BENEFITS[RANK_BENEFITS.length - 1];
    const products = (
      await ProductModel.findAll({
        where: { partnerId: null, stock: { [Op.gt]: 0 } },
        limit: 2000,
        order: [['id', 'ASC']],
      })
    ).filter(isSellable);
    const { lines } = await this.cart.resolveLines(
      products.map((product) => ({ productId: product.id, size: product.availableSizes?.[0] ?? '', quantity: 1 })),
    );
    const byId = new Map(products.map((product) => [product.id, product]));
    const { policy, pricing } = await this.pricing.context(products);
    let eligible = 0,
      stacking = 0,
      discountTotal = 0,
      profitTotal = 0,
      baselineTotal = 0,
      betterThanStandard = 0;
    const refusals: Record<string, number> = {};
    const samples: Record<string, unknown>[] = [];
    for (const line of lines) {
      if (line.status !== 'OK' || !line.product) continue;
      const product = byId.get(line.productId)!;
      const stackLines = toStackLines([
        {
          productId: product.id,
          sku: product.sku,
          listPrice: product.price,
          salePrice: line.product.salePrice,
          managedSale: line.product.managedSale,
          quantity: 1,
          costVnd: pricing.get(product.id)!.costVnd,
          priceApproved: pricing.get(product.id)!.priceApproved,
        },
      ]);
      const evaluation = evaluateStack({ lines: stackLines, voucher, rank: diamond, policy });
      const standard = evaluateStack({ lines: stackLines, voucher: MEMBER10_VOUCHER, rank: null, policy });
      if (evaluation.status === 'VOUCHER_INVALID') {
        refusals[evaluation.reason!] = (refusals[evaluation.reason!] || 0) + 1;
        continue;
      }
      eligible++;
      if (evaluation.status === 'STACK_VALID') stacking++;
      discountTotal += evaluation.primaryDiscountVnd;
      profitTotal += evaluation.plainProfitVnd;
      baselineTotal += evaluation.standardProfitVnd;
      if (evaluation.payableVnd + evaluation.rankDiscountVnd < standard.payableVnd) betterThanStandard++;
      if (samples.length < 10)
        samples.push({
          sku: product.sku,
          name: product.name,
          priceVnd: line.product.salePrice,
          costVnd: pricing.get(product.id)!.costVnd,
          discountVnd: evaluation.primaryDiscountVnd,
          profitVnd: evaluation.plainProfitVnd,
          lossBasisPoints:
            evaluation.standardProfitVnd > 0
              ? Math.max(
                  0,
                  Math.round(
                    ((evaluation.standardProfitVnd - evaluation.plainProfitVnd) * 10_000) / evaluation.standardProfitVnd,
                  ),
                )
              : 10_000,
          stacksWithDiamond: evaluation.status === 'STACK_VALID',
        });
    }
    const evaluated = eligible + Object.values(refusals).reduce((sum, value) => sum + value, 0);
    return {
      ruleVersion: VOUCHER_RULE_VERSION,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        maxDiscountVnd: coupon.maxDiscountVnd ?? null,
      },
      evaluated,
      eligible,
      ineligible: evaluated - eligible,
      stackingWithDiamond: stacking,
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

const MEMBER10_VOUCHER: MainVoucher = { code: 'MEMBER10', kind: 'PERCENT', bps: 1000 };

// The safe range of a percentage voucher on one product at list price R and cost C (v6.2): the standard profit, the
// least the customer may pay so the voucher passes alone, and every 8–25% rate alone and with each rank benefit.
export const voucherLimitsV62 = (listPriceVnd: number, costVnd: number, policy: ProfitPolicy = DEFAULT_PROFIT_POLICY) => {
  const lines: StackLine[] = [{ sku: 'CALC', quantity: 1, listPriceVnd, unitCostVnd: costVnd, shopOwned: true }];
  const atDiscount = (discountVnd: number) =>
    evaluateStack({ lines, voucher: { code: 'CALC', kind: 'FIXED', amountVnd: discountVnd }, rank: null, policy });
  const base = atDiscount(0);
  // The largest fixed discount that still passes alone (profit falls as the discount grows, so a binary search works).
  let low = 0,
    high = listPriceVnd;
  if (atDiscount(0).status === 'VOUCHER_INVALID') high = -1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (atDiscount(middle).status === 'VOUCHER_INVALID') high = middle - 1;
    else low = middle;
  }
  const maximumSafeDiscountVnd = Math.max(0, high);
  const percents = Array.from(
    { length: VOUCHER_MAX_PERCENT - VOUCHER_MIN_PERCENT + 1 },
    (_, index) => VOUCHER_MIN_PERCENT + index,
  );
  return {
    ruleVersion: VOUCHER_RULE_VERSION,
    listPriceVnd,
    memberPriceVnd: memberPrice(listPriceVnd),
    baselineProfitVnd: base.standardProfitVnd,
    minimumProfitVnd: Math.max(Math.ceil((base.standardProfitVnd * policy.keepPlainBps) / 10_000), policy.minimumProfitVnd),
    minimumPaymentVnd: high < 0 ? listPriceVnd : listPriceVnd - maximumSafeDiscountVnd,
    maximumSafeDiscountVnd,
    maximumSafeBasisPoints: listPriceVnd > 0 ? Math.floor((maximumSafeDiscountVnd * 10_000) / listPriceVnd) : 0,
    percents: percents.map((percent) => {
      const voucher: MainVoucher = { code: 'CALC', kind: 'PERCENT', bps: percent * 100 };
      const alone = evaluateStack({ lines, voucher, rank: null, policy });
      return {
        percent,
        discountVnd: alone.primaryDiscountVnd || Math.round((listPriceVnd * percent) / 100),
        profitVnd: alone.plainProfitVnd,
        allowed: alone.status !== 'VOUCHER_INVALID',
        // The ranks whose benefit may be added on top of this rate.
        stacksWith: RANK_BENEFITS.filter(
          (rank) => evaluateStack({ lines, voucher, rank, policy }).status === 'STACK_VALID',
        ).map((rank) => rank.tier),
      };
    }),
  };
};
