// Checkout benefits stacked the way large marketplaces do (owner decision 2026-10-21): the sale price, then one money-off
// voucher, one free-shipping voucher, and loyalty points — all inside one profit guard, so an order is never sold
// below the shop's minimum profit (docs/business/pricing-voucher-specification.md, "Stacking"). Pure whole-VND
// arithmetic shared by the server (it decides) and the cart (it explains).
import {
  DEFAULT_RULES,
  evaluateVoucher,
  type PricingLine,
  type PricingRules,
  type VoucherRefusal,
  type VoucherTerms,
} from './pricing';

// One loyalty point is worth this much at checkout, for at most this share of the shop merchandise.
export const POINT_VALUE_VND = 500;
export const POINTS_MAX_SHARE_BP = 1000;

export interface FreeshipTerms {
  minOrderVnd: number;
  maxShippingVnd: number;
}

export type BenefitRefusal = VoucherRefusal | 'no_shipping_fee' | 'points_unavailable';

export interface StackInput {
  lines: PricingLine[];
  shippingFeeVnd: number;
  voucher?: VoucherTerms | null;
  // A voucher already priced under its own approved rules (agent campaign codes: the legal 50% limit and the agent's
  // margin policy); it is taken as given, and free shipping and points must still fit after it.
  approvedVoucherVnd?: number | null;
  freeship?: FreeshipTerms | null;
  // Points the customer asks to use, and what they own.
  pointsRequested?: number;
  pointsAvailable?: number;
  rules?: PricingRules;
}

export interface StackResult {
  merchandiseVnd: number; // shop-owned lines at their sale price (before vouchers)
  voucherDiscountVnd: number;
  voucherRefusal: BenefitRefusal | null;
  shippingDiscountVnd: number;
  freeshipRefusal: BenefitRefusal | null;
  pointsUsed: number;
  pointsDiscountVnd: number;
  // The most points the order can take now (for the cart's toggle).
  pointsMax: number;
  // Shop profit on the shop-owned lines after every benefit, and the floor it must keep.
  profitVnd: number;
  minimumProfitVnd: number;
  totalDiscountVnd: number;
}

const afterFee = (amount: number, rules: PricingRules) => amount - Math.round((amount * rules.feeBasisPoints) / 10_000);

// The benefits in a fixed order — voucher (as published, refused rather than shrunk), free shipping (up to its cap and the
// fee), then points (as many as still fit) — each one allowed only while the shop keeps its minimum profit.
export function evaluateStack(input: StackInput): StackResult {
  const rules = input.rules ?? DEFAULT_RULES;
  const shopLines = input.lines.filter((line) => !line.partnerId && line.quantity > 0);
  // The baseline (no voucher) gives the cost, the standard profit and its floor for these lines.
  const base = evaluateVoucher({ discountPercent: 0, profitGuard: true }, shopLines, rules);
  const merchandiseVnd = base.regularTotalVnd;
  const knownCost =
    shopLines.length > 0 && shopLines.every((line) => line.unitCostVnd > 0) && base.baselineProfitVnd > 0;
  let minimumProfitVnd = base.minimumProfitVnd;

  let voucherDiscountVnd = 0;
  let voucherRefusal: BenefitRefusal | null = null;
  if (input.approvedVoucherVnd !== undefined && input.approvedVoucherVnd !== null) {
    voucherDiscountVnd = Math.max(0, Math.min(input.approvedVoucherVnd, merchandiseVnd));
    if (!shopLines.length) voucherRefusal = 'no_eligible_items';
  } else if (input.voucher) {
    const evaluation = evaluateVoucher({ ...input.voucher, profitGuard: true }, shopLines, rules);
    if (evaluation.eligible) {
      voucherDiscountVnd = evaluation.discountVnd;
      minimumProfitVnd = evaluation.minimumProfitVnd;
    } else voucherRefusal = evaluation.refusal;
  }
  const profitAfter = (discount: number) => afterFee(merchandiseVnd - discount, rules) - base.costTotalVnd;
  const room = () => profitAfter(voucherDiscountVnd + shippingDiscountVnd) - minimumProfitVnd;

  let shippingDiscountVnd = 0;
  let freeshipRefusal: BenefitRefusal | null = null;
  if (input.freeship) {
    const wanted = Math.min(input.freeship.maxShippingVnd, Math.max(0, input.shippingFeeVnd));
    if (!shopLines.length) freeshipRefusal = 'no_eligible_items';
    else if (merchandiseVnd < input.freeship.minOrderVnd) freeshipRefusal = 'minimum_order';
    else if (wanted <= 0) freeshipRefusal = 'no_shipping_fee';
    else if (!knownCost) freeshipRefusal = base.costTotalVnd <= 0 ? 'missing_cost' : 'no_standard_profit';
    else if (room() < wanted) freeshipRefusal = 'profit_floor';
    else shippingDiscountVnd = wanted;
  }

  // Points: whole points, at most 10% of the shop merchandise, what the customer owns, and what the profit allows.
  const share = Math.floor((merchandiseVnd * POINTS_MAX_SHARE_BP) / 10_000);
  const owned = Math.max(0, input.pointsAvailable ?? 0);
  const profitRoom = knownCost ? Math.max(0, room()) : 0;
  const pointsMax = Math.max(
    0,
    Math.min(owned, Math.floor(Math.min(share, profitRoom, merchandiseVnd - voucherDiscountVnd) / POINT_VALUE_VND)),
  );
  const pointsUsed = Math.min(Math.max(0, Math.floor(input.pointsRequested ?? 0)), pointsMax);
  const pointsDiscountVnd = pointsUsed * POINT_VALUE_VND;

  return {
    merchandiseVnd,
    voucherDiscountVnd,
    voucherRefusal,
    shippingDiscountVnd,
    freeshipRefusal,
    pointsUsed,
    pointsDiscountVnd,
    pointsMax,
    profitVnd: profitAfter(voucherDiscountVnd + shippingDiscountVnd + pointsDiscountVnd),
    minimumProfitVnd,
    totalDiscountVnd: voucherDiscountVnd + shippingDiscountVnd + pointsDiscountVnd,
  };
}

// --- Membership tiers: perks instead of a flat discount (owner decision 2026-10-21) --------------------------------

export interface TierPerks {
  // Points earned per 40,000 VND of completed shop merchandise are multiplied by this (basis points of 1×).
  pointsMultiplierBp: number;
  // Free-shipping codes issued each month, and the shipping fee each one covers.
  monthlyFreeship: number;
  freeshipCapVnd: number;
}

// Higher tiers earn faster and ship cheaper; tier-only voucher drops use `coupon.minTier`. No flat tier discount: it
// could sell below cost (the former 2–15% discount had no profit check).
export const TIER_PERKS: Record<string, TierPerks> = {
  MEMBER: { pointsMultiplierBp: 10_000, monthlyFreeship: 0, freeshipCapVnd: 0 },
  BRONZE: { pointsMultiplierBp: 11_000, monthlyFreeship: 1, freeshipCapVnd: 30_000 },
  SILVER: { pointsMultiplierBp: 12_000, monthlyFreeship: 2, freeshipCapVnd: 30_000 },
  GOLD: { pointsMultiplierBp: 13_000, monthlyFreeship: 2, freeshipCapVnd: 50_000 },
  PLATINUM: { pointsMultiplierBp: 15_000, monthlyFreeship: 3, freeshipCapVnd: 50_000 },
  EMERALD: { pointsMultiplierBp: 17_500, monthlyFreeship: 4, freeshipCapVnd: 70_000 },
  DIAMOND: { pointsMultiplierBp: 20_000, monthlyFreeship: 5, freeshipCapVnd: 70_000 },
};
export const TIER_ORDER = ['MEMBER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'] as const;
export const tierAtLeast = (tier: string, minimum: string | null | undefined) =>
  !minimum ||
  TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]) >= TIER_ORDER.indexOf(minimum as (typeof TIER_ORDER)[number]);

export const tierPerks = (tier: string) => TIER_PERKS[tier] ?? TIER_PERKS.MEMBER;

// Points for a completed order: one per 40,000 VND of net shop merchandise, times the tier multiplier (rounded down).
export const earnedPoints = (netMerchandiseVnd: number, tier: string) =>
  Math.floor((Math.floor(Math.max(0, netMerchandiseVnd) / 40_000) * tierPerks(tier).pointsMultiplierBp) / 10_000);

// --- Free-shipping tiers by order value (owner decision 2026-10-21) ----------------------------------------------

export const FREESHIP_TIERS: readonly (FreeshipTerms & { code: string })[] = [
  { code: 'FREESHIP30', minOrderVnd: 500_000, maxShippingVnd: 30_000 },
  { code: 'FREESHIP50', minOrderVnd: 2_000_000, maxShippingVnd: 50_000 },
];

// --- Engagement: daily check-in and the lucky wheel ---------------------------------------------------------------

// Points for day N of a check-in streak (resets after a missed day); day 7 also earns a free-shipping code.
export const CHECKIN_POINTS = [1, 1, 2, 2, 3, 3, 5] as const;
export const checkinReward = (streakDay: number) => {
  const day = ((Math.max(1, streakDay) - 1) % CHECKIN_POINTS.length) + 1;
  return { day, points: CHECKIN_POINTS[day - 1], freeship: day === CHECKIN_POINTS.length };
};

export type WheelPrize =
  | { kind: 'points'; points: number }
  | { kind: 'voucher'; percent: number; maxDiscountVnd: number; minOrderVnd: number }
  | { kind: 'freeship'; maxShippingVnd: number; minOrderVnd: number }
  | { kind: 'none' };

// Weighted prizes (weights out of 1,000). Vouchers stay profit-guarded when used, so a prize never makes an order lose
// money; their expected cost is bounded by the caps and the wheel's daily limit of one spin.
export const WHEEL_PRIZES: readonly { weight: number; prize: WheelPrize; label: string }[] = [
  { weight: 300, prize: { kind: 'points', points: 2 }, label: '+2 điểm' },
  { weight: 150, prize: { kind: 'points', points: 5 }, label: '+5 điểm' },
  { weight: 40, prize: { kind: 'points', points: 20 }, label: '+20 điểm' },
  { weight: 160, prize: { kind: 'freeship', maxShippingVnd: 30_000, minOrderVnd: 300_000 }, label: 'Freeship 30K' },
  {
    weight: 110,
    prize: { kind: 'voucher', percent: 3, maxDiscountVnd: 50_000, minOrderVnd: 500_000 },
    label: 'Giảm 3%',
  },
  {
    weight: 40,
    prize: { kind: 'voucher', percent: 5, maxDiscountVnd: 100_000, minOrderVnd: 1_000_000 },
    label: 'Giảm 5%',
  },
  { weight: 200, prize: { kind: 'none' }, label: 'Chúc may mắn' },
];

// The prize for a uniform random number in [0, 1000).
export const wheelPrize = (roll: number) => {
  let left = Math.floor(roll);
  for (const [index, entry] of WHEEL_PRIZES.entries()) {
    if (left < entry.weight) return { index, ...entry };
    left -= entry.weight;
  }
  const last = WHEEL_PRIZES.length - 1;
  return { index: last, ...WHEEL_PRIZES[last] };
};

// Missions that earn points once each; every one is checked by the server, never claimed on the customer's word
// (except `share`, which is worth little and can be claimed once). `review`: a review of at least 30 characters.
export const MISSIONS = {
  complete_profile: { points: 20 },
  first_order: { points: 30 },
  review: { points: 15 },
  share: { points: 5 },
} as const;
export type MissionKey = keyof typeof MISSIONS;

// Voucher drops released every day at fixed Vietnam hours (the shop's "săn mã 0h · 12h · 20h"): a limited number of
// customers can save each one; discount drops stay profit-guarded when used.
export const DAILY_DROPS = [
  {
    hour: 0,
    slug: '00',
    title: 'Freeship 0H',
    benefitType: 'freeship' as const,
    maxShippingVnd: 30_000,
    discountPercent: 0,
    maxDiscountVnd: null,
    minOrderVnd: 300_000,
    claimLimit: 50,
  },
  {
    hour: 12,
    slug: '12',
    title: 'Săn trưa giảm 8%',
    benefitType: 'discount' as const,
    maxShippingVnd: null,
    discountPercent: 8,
    maxDiscountVnd: 100_000,
    minOrderVnd: 800_000,
    claimLimit: 30,
  },
  {
    hour: 20,
    slug: '20',
    title: 'Săn đêm giảm 12%',
    benefitType: 'discount' as const,
    maxShippingVnd: null,
    discountPercent: 12,
    maxDiscountVnd: 200_000,
    minOrderVnd: 1_500_000,
    claimLimit: 20,
  },
] as const;
