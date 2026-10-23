import crypto from 'crypto';
import LoyaltyService from './LoyaltyService';
import { Op, type Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import CouponModel from '../database/client/models/Coupon.Model';
import VoucherClaimModel from '../database/client/models/VoucherClaim.Model';
import LoyaltyLedgerModel from '../database/client/models/LoyaltyLedger.Model';
import OrderModel from '../database/client/models/Order.Model';
import ReviewModel from '../database/client/models/Review.Model';
import UserModel from '../database/internal/models/User.Model';
import type ProductModel from '../database/client/models/Product.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { toInteger } from '../../../shared/server/utils/ValidationUtils';
import { loyaltyBalances } from '../../../shared/loyalty-rules';
import { vnDate } from '../../../shared/fulfillment';
import {
  DAILY_DROPS,
  MISSIONS,
  WHEEL_PRIZES,
  checkinReward,
  evaluateCheckout,
  rankBenefitFor,
  tierAtLeast,
  wheelPrize,
  type CheckoutBenefits,
  type FreeshipRefusal,
  type MissionKey,
  FREESHIP_TIERS,
} from '../../../shared/promotions';
import { VOUCHER_RULE_VERSION, type RankBenefit } from '../../../shared/voucher-stack';
import CommercePolicyService from './CommercePolicyService';
import { assertCouponUsable, couponDiscount, couponVoucher, normalizeCouponCode, toStackLines } from './CouponService';
import { assertVoucherBudget, couponPricingLines } from './VoucherService';
import PricingApprovalService from './PricingApprovalService';
import SaleCampaignService from './SaleCampaignService';
import type { CartLine } from './CartService';

// What customers are told when a benefit does not apply: the reason in plain words, never a profit figure (BR-016).
const NOT_FOR_THIS_CART = 'Mã này không áp dụng được cho sản phẩm hoặc giỏ hàng hiện tại.';
export const BENEFIT_MESSAGES: Record<FreeshipRefusal, string> = {
  EXPIRED: 'Mã giảm giá đã hết hạn.',
  BUDGET_EXCEEDED: 'Chương trình khuyến mãi đã hết ngân sách.',
  POINTS_INSUFFICIENT: 'Bạn chưa đủ điểm để dùng ưu đãi này.',
  SKU_INELIGIBLE: 'Mã này không áp dụng cho sản phẩm trong giỏ.',
  MISSING_DATA: 'Mã này tạm chưa áp dụng được cho sản phẩm trong giỏ.',
  MINIMUM_ORDER: 'Giỏ hàng chưa đạt giá trị tối thiểu của mã.',
  MINIMUM_ITEMS: 'Giỏ hàng chưa đủ số sản phẩm tối thiểu của mã.',
  CART_TYPE: 'Mã này chỉ áp dụng cho loại giỏ hàng khác (một sản phẩm hoặc giỏ từ hai sản phẩm).',
  NO_STANDARD_PROFIT: NOT_FOR_THIS_CART,
  INSUFFICIENT_PROFIT_80: NOT_FOR_THIS_CART,
  INSUFFICIENT_PROFIT_75: NOT_FOR_THIS_CART,
  MIN_ABSOLUTE_PROFIT: NOT_FOR_THIS_CART,
  MIN_MARGIN: NOT_FOR_THIS_CART,
  NO_SHIPPING_FEE: 'Đơn này chưa có phí vận chuyển để giảm.',
};
export const RANK_REFUSAL_MESSAGE = 'Ưu đãi hạng không áp dụng cùng mã này cho sản phẩm/giỏ hiện tại.';

// Codes priced under their own approved rules rather than the shop voucher rules: agent campaign codes (the legal 50%
// limit, the agent's autonomy policy and margin floor). Every other code, point-redemption vouchers included, is a v6.2
// main voucher.
export const approvedVoucher = (coupon: Pick<CouponModel, 'source'>) => coupon.source === 'agent';

const MAX_DAILY_SPINS = 1;
const DAY_MS = 86_400_000;

export interface ResolvedBenefits {
  benefits: CheckoutBenefits;
  voucher: CouponModel | null;
  freeship: CouponModel | null;
  rank: RankBenefit | null;
  snapshot: Record<string, unknown> | null;
  // The approved voucher policy the guard used (null: the v6.2 values).
  policyVersion: number | null;
}

// The order's benefit record as customers may see it: without the staff-only profit figures.
export const publicBenefitSnapshot = (snapshot: Record<string, unknown> | null | undefined) => {
  if (!snapshot) return snapshot ?? null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { internal, profitVnd, minimumProfitVnd, ...rest } = snapshot;
  return rest;
};

// Checkout benefits under the owner's rules v6.2 (src/shared/promotions.ts): one main voucher, at most one rank benefit
// on top of it, and a free-shipping code whose cost is part of the profit checks; and the ways customers earn codes and
// points: voucher drops saved to the wallet, a daily check-in, a daily lucky-wheel spin and missions
// (docs/business/promotions-specification.md).
export default class PromotionService {
  private policies = new CommercePolicyService();

  private async tierOf(userId: number, transaction?: Transaction) {
    return loyaltyBalances(await LoyaltyLedgerModel.findAll({ where: { userId }, transaction }));
  }

  // A code checked for one slot: usable now, the right kind, saved to the wallet when it is a drop, and allowed for the
  // customer's tier.
  private async code(
    raw: unknown,
    slot: 'discount' | 'freeship',
    subtotalVnd: number,
    userId: number | undefined,
    tier: string,
    transaction?: Transaction,
  ) {
    const code = normalizeCouponCode(raw);
    if (!code) return null;
    const coupon = assertCouponUsable(
      await CouponModel.findOne({
        where: { code },
        transaction,
        ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
      }),
      subtotalVnd,
      userId,
    );
    if ((coupon.benefitType ?? 'discount') !== slot)
      throw HttpError.badRequest(
        slot === 'discount'
          ? 'Đây là mã miễn phí vận chuyển: hãy nhập vào ô mã vận chuyển.'
          : 'Đây là mã giảm giá: hãy nhập vào ô mã giảm giá.',
        undefined,
        'VOUCHER_SLOT',
      );
    if (coupon.requiresClaim) {
      if (!userId) throw HttpError.unauthorized('Đăng nhập để dùng mã đã lưu.');
      if (!(await VoucherClaimModel.findOne({ where: { couponId: coupon.id, userId }, transaction })))
        throw HttpError.conflict('Hãy lưu mã vào ví trước khi dùng.', 'VOUCHER_NOT_CLAIMED');
    }
    if (!tierAtLeast(tier, coupon.minTier))
      throw HttpError.conflict(`Mã này dành cho hạng ${coupon.minTier} trở lên.`, 'VOUCHER_TIER');
    return coupon;
  }

  // What the codes do to these lines; refusals become user-facing errors when `strict` (placing the order), or come
  // back in the result for the cart to explain. Points are never spent here: they buy point vouchers in the wallet.
  async resolve(input: {
    userId?: number;
    lines: CartLine[];
    products: Map<number, ProductModel>;
    shippingFeeVnd: number;
    couponCode?: unknown;
    freeshipCode?: unknown;
    redeemPoints?: unknown;
    transaction?: Transaction;
    strict?: boolean;
  }): Promise<ResolvedBenefits> {
    if (input.strict && (toInteger(input.redeemPoints) ?? 0) > 0)
      throw HttpError.conflict(
        'Điểm không dùng như tiền khi thanh toán; hãy đổi điểm lấy voucher trong ví thành viên.',
        'POINTS_NOT_CASH',
      );
    // The voucher policy and the approved price and cost of these products (PricingApprovalService).
    const guard = await new PricingApprovalService().context(input.products.values(), input.transaction);
    const priced = couponPricingLines(input.lines, input.products, guard.pricing);
    const shopSubtotal = priced
      .filter((line) => !line.partnerId)
      .reduce((sum, line) => sum + line.salePrice * line.quantity, 0);
    // The member's tier matters only when a code is used (no extra reads for a plain order).
    const wantsBenefit = !!normalizeCouponCode(input.couponCode) || !!normalizeCouponCode(input.freeshipCode);
    const balances = input.userId && wantsBenefit ? await this.tierOf(input.userId, input.transaction) : null;
    const tier = balances?.tier.name ?? 'MEMBER';
    const voucher = await this.code(input.couponCode, 'discount', shopSubtotal, input.userId, tier, input.transaction);
    const freeship = await this.code(
      input.freeshipCode,
      'freeship',
      shopSubtotal,
      input.userId,
      tier,
      input.transaction,
    );
    const approved = !!voucher && approvedVoucher(voucher);
    const rank = voucher && balances && !approved ? rankBenefitFor(balances.lifetime) : null;
    const benefits = evaluateCheckout({
      lines: toStackLines(priced),
      voucher: voucher && !approved ? couponVoucher(voucher) : null,
      approvedVoucher: voucher && approved ? { code: voucher.code, discountVnd: couponDiscount(voucher, priced) } : null,
      rank,
      freeship: freeship ? { minOrderVnd: freeship.minOrderVnd, maxShippingVnd: freeship.maxShippingVnd ?? 0 } : null,
      shippingFeeVnd: input.shippingFeeVnd,
      policy: guard.policy,
    });
    if (input.strict) {
      if (voucher && benefits.voucherRefusal)
        throw HttpError.conflict(BENEFIT_MESSAGES[benefits.voucherRefusal], 'VOUCHER_NOT_ELIGIBLE');
      if (freeship && benefits.freeshipRefusal)
        throw HttpError.conflict(BENEFIT_MESSAGES[benefits.freeshipRefusal], 'FREESHIP_NOT_ELIGIBLE');
      if (voucher) assertVoucherBudget(voucher, benefits.voucherDiscountVnd);
      if (freeship) assertVoucherBudget(freeship, benefits.shippingDiscountVnd);
    }
    const evaluation = benefits.evaluation;
    const snapshot =
      voucher || freeship
        ? {
            kind: 'v6.2',
            ruleVersion: VOUCHER_RULE_VERSION,
            // The approved voucher policy the guard used (null: the v6.2 values, none approved yet).
            policyVersion: guard.policyVersion,
            tier,
            status: evaluation?.status ?? null,
            voucher: voucher
              ? {
                  couponCode: voucher.code,
                  source: voucher.source,
                  discountPercent: voucher.discountPercent,
                  fixedAmountVnd: voucher.fixedAmountVnd || null,
                  maxDiscountVnd: voucher.maxDiscountVnd ?? null,
                  discountVnd: benefits.voucherDiscountVnd,
                  approved,
                }
              : null,
            rank: rank
              ? {
                  code: rank.code,
                  tier: rank.tier,
                  bps: rank.bps,
                  capVnd: rank.capVnd,
                  discountVnd: benefits.rankDiscountVnd,
                  refusal: benefits.rankRefusal,
                }
              : null,
            freeship: freeship
              ? {
                  couponCode: freeship.code,
                  maxShippingVnd: freeship.maxShippingVnd ?? 0,
                  shippingDiscountVnd: benefits.shippingDiscountVnd,
                }
              : null,
            scope: 'shop_owned',
            basisVnd: shopSubtotal,
            discountVnd: benefits.discountVnd,
            earnedPoints: evaluation?.earnedPoints ?? null,
            eligibleProductIds: priced.filter((line) => !line.partnerId).map((line) => line.productId),
            // Staff only: removed from every customer response (publicBenefitSnapshot).
            internal: evaluation
              ? {
                  standardProfitVnd: evaluation.standardProfitVnd,
                  plainProfitVnd: evaluation.plainProfitVnd,
                  stackProfitVnd: evaluation.stackProfitVnd,
                }
              : null,
          }
        : null;
    return { benefits, voucher, freeship, rank, snapshot, policyVersion: guard.policyVersion };
  }

  // Inside the order transaction: count the codes' use and budget, and reserve owned codes.
  async apply(order: OrderModel, resolved: ResolvedBenefits, transaction: Transaction) {
    const take = async (coupon: CouponModel | null, amountVnd: number) => {
      if (!coupon) return;
      if (coupon.budgetVnd !== null && coupon.budgetVnd !== undefined)
        await coupon.increment('budgetUsedVnd', { by: amountVnd, transaction });
      if (coupon.ownerUserId && coupon.source === 'loyalty')
        await coupon.update({ reservedOrderId: order.id }, { transaction });
      else await coupon.increment('usageCount', { transaction });
    };
    await take(resolved.voucher, resolved.benefits.voucherDiscountVnd);
    await take(resolved.freeship, resolved.benefits.shippingDiscountVnd);
  }

  // A cancelled order gives back what it used: the free-shipping code (the discount code is restored by OrderService
  // as before) and the points.
  async release(order: OrderModel, transaction: Transaction) {
    if (order.freeshipCode) {
      await CouponModel.update(
        { reservedOrderId: null },
        { where: { code: order.freeshipCode, source: 'loyalty', reservedOrderId: order.id }, transaction },
      );
      await CouponModel.decrement('usageCount', {
        where: { code: order.freeshipCode, source: { [Op.ne]: 'loyalty' }, usageCount: { [Op.gt]: 0 } },
        transaction,
      });
      if (order.shippingDiscountVnd > 0)
        await CouponModel.decrement('budgetUsedVnd', {
          by: order.shippingDiscountVnd,
          where: {
            code: order.freeshipCode,
            budgetVnd: { [Op.ne]: null },
            budgetUsedVnd: { [Op.gte]: order.shippingDiscountVnd },
          },
          transaction,
        });
    }
    if (order.pointsUsed > 0) {
      const spent = await LoyaltyLedgerModel.findOne({
        where: { sourceReference: `order-points:${order.id}` },
        transaction,
      });
      if (spent)
        await LoyaltyLedgerModel.findOrCreate({
          where: { sourceReference: `order-points-restore:${order.id}` },
          defaults: {
            userId: order.userId,
            actorUserId: order.userId,
            sourceReference: `order-points-restore:${order.id}`,
            kind: 'restore',
            balanceDelta: order.pointsUsed,
            lifetimeDelta: 0,
            usedDelta: -order.pointsUsed,
            policyVersion: spent.policyVersion,
            reason: `Hoàn điểm đơn #${order.id} đã huỷ`,
            details: { orderId: order.id },
          },
          transaction,
        });
    }
  }

  // A delivered order uses up its owned free-shipping code for good.
  async finalize(order: OrderModel, transaction: Transaction) {
    if (order.freeshipCode)
      await CouponModel.update(
        { usedAt: new Date(), usageCount: 1, reservedOrderId: null },
        { where: { code: order.freeshipCode, source: 'loyalty', reservedOrderId: order.id }, transaction },
      );
  }

  // --- Engagement ---------------------------------------------------------------------------------------------

  private async customer(userId: number, transaction: Transaction) {
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user?.isActive || user.role !== 'USER')
      throw HttpError.forbidden('Chỉ tài khoản khách hàng nhận được ưu đãi.');
    return user;
  }

  private async award(
    userId: number,
    sourceReference: string,
    kind: string,
    points: number,
    reason: string,
    details: Record<string, unknown>,
    transaction: Transaction,
  ) {
    const policy = await this.policies.approved('loyalty', transaction);
    const [, created] = await LoyaltyLedgerModel.findOrCreate({
      where: { sourceReference },
      defaults: {
        userId,
        actorUserId: userId,
        sourceReference,
        kind,
        balanceDelta: points,
        lifetimeDelta: 0,
        usedDelta: 0,
        policyVersion: policy.version,
        reason,
        details,
      },
      transaction,
    });
    return created;
  }

  // An owned single-use code (free shipping or a small percentage), issued by a perk or a prize.
  private async issue(
    userId: number,
    code: string,
    terms: {
      title: string;
      benefitType: 'discount' | 'freeship';
      discountPercent?: number;
      maxDiscountVnd?: number;
      maxShippingVnd?: number;
      minOrderVnd: number;
      days?: number;
      expiresAt?: Date;
    },
    transaction: Transaction,
  ) {
    const now = new Date();
    const [coupon] = await CouponModel.findOrCreate({
      where: { code },
      defaults: {
        code,
        title: terms.title,
        discountPercent: terms.discountPercent ?? 0,
        maxDiscountVnd: terms.maxDiscountVnd ?? null,
        maxShippingVnd: terms.maxShippingVnd ?? null,
        benefitType: terms.benefitType,
        usageLimit: 1,
        startDate: now,
        expirationDate: terms.expiresAt ?? new Date(now.getTime() + (terms.days ?? 7) * DAY_MS),
        isActive: true,
        minOrderVnd: terms.minOrderVnd,
        source: 'loyalty',
        kind: 'standard',
        ownerUserId: userId,
        profitGuard: true,
        policySnapshot: { ruleVersion: VOUCHER_RULE_VERSION, issuedAt: now.toISOString() },
      },
      transaction,
    });
    return coupon;
  }

  private checkins(entries: LoyaltyLedgerModel[]) {
    return entries
      .filter((entry) => entry.kind === 'checkin')
      .map((entry) => ({ date: String(entry.details.date), day: Number(entry.details.day) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async checkin(userId: number) {
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.customer(userId, transaction);
      const entries = await LoyaltyLedgerModel.findAll({ where: { userId }, transaction });
      const today = vnDate(),
        yesterday = vnDate(new Date(Date.now() - DAY_MS));
      const last = this.checkins(entries)[0];
      if (last?.date === today) throw HttpError.conflict('Hôm nay bạn đã điểm danh rồi.', 'CHECKIN_DONE');
      const streak = last?.date === yesterday ? last.day + 1 : 1;
      const reward = checkinReward(streak);
      await this.award(
        userId,
        `checkin:${userId}:${today}`,
        'checkin',
        reward.points,
        `Điểm danh ngày ${reward.day}`,
        { date: today, day: streak },
        transaction,
      );
      const coupon = reward.freeship
        ? await this.issue(
            userId,
            `CHK${today.replace(/-/g, '').slice(2)}-${userId}`,
            {
              title: 'Freeship chuỗi 7 ngày',
              benefitType: 'freeship',
              maxShippingVnd: 30_000,
              minOrderVnd: 300_000,
              days: 14,
            },
            transaction,
          )
        : null;
      return { day: reward.day, streak, points: reward.points, couponCode: coupon?.code ?? null };
    });
  }

  async spin(userId: number) {
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.customer(userId, transaction);
      await this.policies.approved('loyalty', transaction);
      const today = vnDate();
      const spins = await LoyaltyLedgerModel.count({
        where: { userId, kind: 'wheel', sourceReference: { [Op.like]: `wheel:${userId}:${today}:%` } },
        transaction,
      });
      if (spins >= MAX_DAILY_SPINS)
        throw HttpError.conflict('Hôm nay bạn đã quay rồi, hẹn bạn ngày mai.', 'WHEEL_DONE');
      const drawn = wheelPrize(crypto.randomInt(0, 1_000));
      let couponCode: string | null = null;
      const tag = `${today.replace(/-/g, '').slice(2)}-${userId}`;
      if (drawn.prize.kind === 'freeship')
        couponCode = (
          await this.issue(
            userId,
            `WFS${tag}`,
            {
              title: `Vòng quay: ${drawn.label}`,
              benefitType: 'freeship',
              maxShippingVnd: drawn.prize.maxShippingVnd,
              minOrderVnd: drawn.prize.minOrderVnd,
              days: 7,
            },
            transaction,
          )
        ).code;
      if (drawn.prize.kind === 'voucher')
        couponCode = (
          await this.issue(
            userId,
            `WVC${tag}`,
            {
              title: `Vòng quay: ${drawn.label}`,
              benefitType: 'discount',
              discountPercent: drawn.prize.percent,
              maxDiscountVnd: drawn.prize.maxDiscountVnd,
              minOrderVnd: drawn.prize.minOrderVnd,
              days: 7,
            },
            transaction,
          )
        ).code;
      await this.award(
        userId,
        `wheel:${userId}:${today}:${spins + 1}`,
        'wheel',
        drawn.prize.kind === 'points' ? drawn.prize.points : 0,
        `Vòng quay may mắn: ${drawn.label}`,
        { date: today, prize: drawn.prize, couponCode, index: drawn.index },
        transaction,
      );
      return { index: drawn.index, label: drawn.label, prize: drawn.prize, couponCode };
    });
  }

  private async missionDone(userId: number, key: MissionKey, transaction?: Transaction) {
    if (key === 'share') return true;
    if (key === 'complete_profile') {
      const user = await UserModel.findByPk(userId, { transaction });
      return !!(user?.phone && user.address);
    }
    if (key === 'first_order')
      return (await OrderModel.count({ where: { userId, status: 'DELIVERED' }, transaction })) > 0;
    const reviews = await ReviewModel.findAll({ where: { userId }, transaction });
    return reviews.some((review) => (review.content || '').trim().length >= 30);
  }

  async claimMission(userId: number, key: string) {
    if (!(key in MISSIONS)) throw HttpError.notFound('Nhiệm vụ không tồn tại.');
    const mission = key as MissionKey;
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.customer(userId, transaction);
      if (!(await this.missionDone(userId, mission, transaction)))
        throw HttpError.conflict('Bạn chưa hoàn thành nhiệm vụ này.', 'MISSION_INCOMPLETE');
      const created = await this.award(
        userId,
        `mission:${mission}:${userId}`,
        'mission',
        MISSIONS[mission].points,
        `Nhiệm vụ: ${mission}`,
        { mission },
        transaction,
      );
      if (!created) throw HttpError.conflict('Bạn đã nhận thưởng nhiệm vụ này.', 'MISSION_DONE');
      return { mission, points: MISSIONS[mission].points };
    });
  }

  // Saves a voucher drop to the customer's wallet: from its start time, while the quantity lasts, once per customer.
  async claimVoucher(userId: number, couponId: number) {
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.customer(userId, transaction);
      const coupon = await CouponModel.findByPk(couponId, { transaction, lock: transaction.LOCK.UPDATE });
      const now = Date.now();
      if (!coupon?.requiresClaim || !coupon.isActive || coupon.ownerUserId)
        throw HttpError.notFound('Mã không tồn tại.');
      if (new Date(coupon.startDate).getTime() > now)
        throw HttpError.conflict('Mã chưa mở, hãy quay lại đúng giờ.', 'DROP_NOT_OPEN');
      if (new Date(coupon.expirationDate).getTime() < now) throw HttpError.conflict('Mã đã hết hạn.', 'DROP_EXPIRED');
      if (await VoucherClaimModel.findOne({ where: { couponId, userId }, transaction }))
        throw HttpError.conflict('Bạn đã lưu mã này.', 'DROP_CLAIMED');
      if (coupon.claimLimit !== null && coupon.claimLimit !== undefined && coupon.claimedCount >= coupon.claimLimit)
        throw HttpError.conflict('Mã đã được lưu hết, hẹn bạn đợt sau.', 'DROP_SOLD_OUT');
      const { tier } = await this.tierOf(userId, transaction);
      if (!tierAtLeast(tier.name, coupon.minTier))
        throw HttpError.conflict(`Mã này dành cho hạng ${coupon.minTier} trở lên.`, 'VOUCHER_TIER');
      await VoucherClaimModel.create({ couponId, userId }, { transaction });
      await coupon.increment('claimedCount', { transaction });
      return { couponId, code: coupon.code };
    });
  }

  // Today's and tomorrow's voucher drops (DAILY_DROPS), created once each (codes D<YYMMDD>-<hour>); each one can be saved
  // from its hour and used for three days.
  // The offers the storefront always advertises: the public free-shipping codes by order size (FREESHIP_TIERS) and the
  // monthly 10% member code template behind every "member price". Profit-guarded like every shop code; created once and
  // renewed before they lapse, never changed when an admin has edited them.
  async ensureStandingOffers(now = new Date()) {
    const until = new Date(now.getTime() + 365 * DAY_MS);
    const offers = [
      ...FREESHIP_TIERS.map((tier) => ({
        code: tier.code,
        title: `Freeship ${Math.round(tier.maxShippingVnd / 1000)}K`,
        description: `Giảm tới ${tier.maxShippingVnd.toLocaleString('vi-VN')}đ phí vận chuyển cho đơn từ ${tier.minOrderVnd.toLocaleString('vi-VN')}đ.`,
        discountPercent: 0,
        benefitType: 'freeship' as const,
        maxShippingVnd: tier.maxShippingVnd,
        minOrderVnd: tier.minOrderVnd,
        kind: 'standard' as const,
        isPublic: true,
      })),
      {
        code: 'MEMBER-MONTHLY',
        title: 'Mã thành viên hằng tháng',
        description: 'Giảm 10% (giá thành viên), mỗi thành viên nhận 1 mã mỗi tháng.',
        discountPercent: 10,
        benefitType: 'discount' as const,
        maxShippingVnd: null,
        minOrderVnd: 0,
        kind: 'member_template' as const,
        isPublic: false,
      },
    ];
    for (const offer of offers) {
      const [coupon, created] = await CouponModel.findOrCreate({
        where: { code: offer.code },
        defaults: {
          ...offer,
          usageLimit: null,
          startDate: now,
          expirationDate: until,
          isActive: true,
          source: 'admin',
          profitGuard: true,
        },
      });
      if (!created && coupon.isActive && coupon.expirationDate.getTime() < now.getTime() + 30 * DAY_MS)
        await coupon.update({ expirationDate: until });
    }
  }

  async ensureDailyDrops(now = new Date()) {
    for (const offset of [0, 1]) {
      const day = vnDate(new Date(now.getTime() + offset * DAY_MS));
      const [year, month, date] = day.split('-').map(Number);
      for (const drop of DAILY_DROPS) {
        const startDate = new Date(Date.UTC(year, month - 1, date, drop.hour - 7));
        await CouponModel.findOrCreate({
          where: { code: `D${day.replace(/-/g, '').slice(2)}-${drop.slug}` },
          defaults: {
            code: `D${day.replace(/-/g, '').slice(2)}-${drop.slug}`,
            title: drop.title,
            description: 'Mã săn theo khung giờ, số lượng có hạn.',
            discountPercent: drop.discountPercent,
            maxDiscountVnd: drop.maxDiscountVnd,
            maxShippingVnd: drop.maxShippingVnd,
            benefitType: drop.benefitType,
            minOrderVnd: drop.minOrderVnd,
            usageLimit: drop.claimLimit,
            startDate,
            expirationDate: new Date(startDate.getTime() + 3 * DAY_MS),
            isActive: true,
            source: 'admin',
            kind: 'standard',
            profitGuard: true,
            requiresClaim: true,
            claimLimit: drop.claimLimit,
          },
        });
      }
    }
  }

  // Everything the promotions hub shows: today's voucher drops, the check-in streak, the wheel, missions, tier perks and
  // the running sale events. Signed-out visitors see the offers without their own progress.
  async hub(userId?: number) {
    const now = new Date(),
      endOfDay = new Date(now.getTime() + DAY_MS);
    const drops = await CouponModel.findAll({
      where: {
        requiresClaim: true,
        isActive: true,
        ownerUserId: null,
        expirationDate: { [Op.gt]: now },
        startDate: { [Op.lt]: endOfDay },
      },
      order: [
        ['startDate', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: 30,
    });
    const claimed = userId
      ? new Set(
          (await VoucherClaimModel.findAll({ where: { userId, couponId: drops.map((drop) => drop.id) } })).map(
            (claim) => claim.couponId,
          ),
        )
      : new Set<number>();
    const entries = userId ? await LoyaltyLedgerModel.findAll({ where: { userId } }) : [];
    const balances = loyaltyBalances(entries);
    const today = vnDate(),
      yesterday = vnDate(new Date(now.getTime() - DAY_MS));
    const last = this.checkins(entries)[0];
    const streak = last && (last.date === today || last.date === yesterday) ? last.day : 0;
    const policy = await this.policies.approved('loyalty').catch(() => null);
    const missions = await Promise.all(
      (Object.keys(MISSIONS) as MissionKey[]).map(async (key) => ({
        key,
        points: MISSIONS[key].points,
        claimed: entries.some((entry) => entry.sourceReference === `mission:${key}:${userId}`),
        ready: userId ? await this.missionDone(userId, key) : false,
      })),
    );
    const events = await new SaleCampaignService().storefront(now).catch(() => ({ events: [] }));
    // Public codes anyone can type at checkout (no saving needed), e.g. the free-shipping tiers.
    const standing = await CouponModel.findAll({
      where: {
        isPublic: true,
        requiresClaim: false,
        ownerUserId: null,
        isActive: true,
        kind: 'standard',
        startDate: { [Op.lte]: now },
        expirationDate: { [Op.gt]: now },
      },
      order: [
        ['benefitType', 'DESC'],
        ['minOrderVnd', 'ASC'],
      ],
      limit: 8,
    });
    // Orders that will earn points once complete, so the member card explains why the tier has not moved yet.
    const pending = userId ? await new LoyaltyService().pending(userId) : [];
    return {
      loyaltyOpen: !!policy,
      standing: standing
        .filter(
          (coupon) =>
            (coupon.usageLimit === null || coupon.usageLimit === undefined || coupon.usageCount < coupon.usageLimit) &&
            (coupon.budgetVnd === null || coupon.budgetVnd === undefined || coupon.budgetUsedVnd < coupon.budgetVnd),
        )
        .map((coupon) => ({
          id: coupon.id,
          kind: 'standing' as const,
          code: coupon.code,
          title: coupon.title,
          benefitType: coupon.benefitType,
          discountPercent: coupon.discountPercent,
          fixedAmountVnd: coupon.fixedAmountVnd || null,
          maxDiscountVnd: coupon.maxDiscountVnd ?? null,
          maxShippingVnd: coupon.maxShippingVnd ?? null,
          minOrderVnd: coupon.minOrderVnd,
          minTier: coupon.minTier ?? null,
          startsAt: coupon.startDate,
          expiresAt: coupon.expirationDate,
          remaining: null,
          claimLimit: null,
          claimed: false,
        })),
      drops: drops.map((drop) => ({
        id: drop.id,
        kind: 'drop' as const,
        code: claimed.has(drop.id) ? drop.code : null,
        title: drop.title,
        benefitType: drop.benefitType,
        discountPercent: drop.discountPercent,
        fixedAmountVnd: drop.fixedAmountVnd || null,
        maxDiscountVnd: drop.maxDiscountVnd ?? null,
        maxShippingVnd: drop.maxShippingVnd ?? null,
        minOrderVnd: drop.minOrderVnd,
        minTier: drop.minTier ?? null,
        startsAt: drop.startDate,
        expiresAt: drop.expirationDate,
        remaining:
          drop.claimLimit === null || drop.claimLimit === undefined
            ? null
            : Math.max(0, drop.claimLimit - drop.claimedCount),
        claimLimit: drop.claimLimit ?? null,
        claimed: claimed.has(drop.id),
      })),
      member: userId
        ? {
            tier: balances.tier.name,
            nextTier: balances.nextTier,
            lifetime: balances.lifetime,
            points: balances.available,
            // The rank benefit the tier adds on top of one main voucher (MU-RANK01…06), when both profit checks pass.
            rank: rankBenefitFor(balances.lifetime),
            pending: {
              orders: pending.length,
              points: pending.reduce((sum, row) => sum + row.points, 0),
            },
          }
        : null,
      checkin: {
        doneToday: last?.date === today,
        streak,
        nextReward: checkinReward(last?.date === today ? streak + 1 : streak + 1),
      },
      wheel: {
        prizes: WHEEL_PRIZES.map((entry) => entry.label),
        spunToday: entries.some((entry) => entry.kind === 'wheel' && entry.details.date === today),
      },
      missions,
      events: events.events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        endsAt: event.endsAt,
        maximumPercent: event.maximumPercent,
        products: event.products.slice(0, 12),
      })),
    };
  }
}
