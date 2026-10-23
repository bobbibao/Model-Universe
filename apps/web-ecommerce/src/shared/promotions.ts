// Checkout benefits under the owner's voucher and loyalty rules v6.2 (docs/business/pricing-voucher-specification.md):
// one main voucher, plus at most one rank benefit, both on the same list price and behind the two profit checks of
// src/shared/voucher-stack.ts; a shop-funded free-shipping code is a cost inside those checks, never a way round them.
// Points are earned on completion and spent only on point-redemption vouchers: they are never cash at checkout.
// Pure whole-VND arithmetic shared by the server (it decides) and the cart (it explains).
import {
  earnedPoints as pointsForPaid,
  evaluateStack,
  POINT_UNIT_VND,
  rankBenefitFor,
  type MainVoucher,
  type ProfitPolicy,
  type RankBenefit,
  type StackEvaluation,
  type StackLine,
  type StackReason,
} from './voucher-stack';

export interface FreeshipTerms {
  minOrderVnd: number;
  maxShippingVnd: number;
}

export type FreeshipRefusal = StackReason | 'NO_SHIPPING_FEE';

export interface CheckoutBenefitsInput {
  lines: readonly StackLine[];
  voucher: MainVoucher | null;
  // A code priced under its own approved rules instead (agent campaign codes: the legal 50% limit and the agent's
  // autonomy policy and margin floor). Taken as given, never topped up with a rank benefit; free shipping on top of it
  // must still pass the profit checks.
  approvedVoucher?: { code: string; discountVnd: number } | null;
  // The customer's rank benefit (from lifetime points); it only ever tops up a main voucher.
  rank: RankBenefit | null;
  freeship: FreeshipTerms | null;
  shippingFeeVnd: number;
  policy?: ProfitPolicy;
}

export interface CheckoutBenefits {
  evaluation: StackEvaluation | null; // the main voucher's evaluation, with the free shipping cost when it applies
  voucherDiscountVnd: number;
  voucherRefusal: StackReason | null;
  rankDiscountVnd: number;
  rankCode: string | null;
  rankRefusal: StackReason | null;
  shippingDiscountVnd: number;
  freeshipRefusal: FreeshipRefusal | null;
  discountVnd: number; // voucher + rank, off the goods
}

// The baseline used when no main voucher is chosen: the free-shipping code alone must still meet the profit floors.
const NO_VOUCHER: MainVoucher = { code: '', kind: 'FIXED', amountVnd: 0 };

// The main voucher (refused, never shrunk), the rank benefit on top of it when both checks pass, then free shipping
// only if its cost keeps every benefit already accepted.
export function evaluateCheckout(input: CheckoutBenefitsInput): CheckoutBenefits {
  const run = (voucher: MainVoucher, giftCostVnd: number, withRank: boolean) =>
    evaluateStack({ lines: input.lines, voucher, rank: withRank ? input.rank : null, giftCostVnd, policy: input.policy });
  let evaluation = input.voucher ? run(input.voucher, 0, true) : null;
  const voucherRefusal = evaluation?.status === 'VOUCHER_INVALID' ? evaluation.reason : null;
  if (voucherRefusal) evaluation = null;
  const approved = !input.voucher && input.approvedVoucher ? input.approvedVoucher : null;
  const approvedDiscountVnd = approved
    ? Math.max(0, Math.min(approved.discountVnd, run(NO_VOUCHER, 0, false).listTotalVnd))
    : 0;

  let shippingDiscountVnd = 0;
  let freeshipRefusal: FreeshipRefusal | null = null;
  if (input.freeship) {
    // What free shipping is checked against: the accepted voucher (and rank), an approved code as a fixed discount of
    // its amount, or no voucher at all.
    const [voucher, withRank] = evaluation
      ? [input.voucher!, true]
      : approved
        ? [{ code: approved.code, kind: 'FIXED', amountVnd: approvedDiscountVnd } as MainVoucher, false]
        : [NO_VOUCHER, false];
    const base = evaluation ?? run(voucher, 0, withRank);
    const wanted = Math.min(input.freeship.maxShippingVnd, Math.max(0, input.shippingFeeVnd));
    if (base.listTotalVnd <= 0) freeshipRefusal = 'SKU_INELIGIBLE';
    else if (base.listTotalVnd < input.freeship.minOrderVnd) freeshipRefusal = 'MINIMUM_ORDER';
    else if (wanted <= 0) freeshipRefusal = 'NO_SHIPPING_FEE';
    else if (base.status === 'VOUCHER_INVALID') freeshipRefusal = base.reason;
    else {
      const withShipping = run(voucher, wanted, withRank);
      if (withShipping.status !== base.status)
        freeshipRefusal =
          withShipping.status === 'VOUCHER_INVALID'
            ? withShipping.reason
            : (withShipping.rankReason ?? 'INSUFFICIENT_PROFIT_75');
      else {
        shippingDiscountVnd = wanted;
        if (evaluation) evaluation = withShipping;
      }
    }
  }

  const voucherDiscountVnd = approved ? approvedDiscountVnd : (evaluation?.primaryDiscountVnd ?? 0);
  const rankDiscountVnd = evaluation?.rankDiscountVnd ?? 0;
  return {
    evaluation,
    voucherDiscountVnd,
    voucherRefusal,
    rankDiscountVnd,
    rankCode: evaluation?.rankCode ?? null,
    rankRefusal: evaluation && input.rank && evaluation.status !== 'STACK_VALID' ? evaluation.rankReason : null,
    shippingDiscountVnd,
    freeshipRefusal,
    discountVnd: voucherDiscountVnd + rankDiscountVnd,
  };
}

// --- Points and tiers ---------------------------------------------------------------------------------------------

// Points for a completed order: one per whole 40,000 VND of goods money really paid after every benefit. There is no
// tier multiplier any more; the tier gives the rank benefit instead (RANK_BENEFITS in voucher-stack.ts).
export const earnedPoints = (netMerchandiseVnd: number) => pointsForPaid(netMerchandiseVnd);

// The eligible spend that earns `points` (the member card's "spend about X more to reach the next tier").
export const spendForPoints = (points: number) => Math.max(0, points) * POINT_UNIT_VND;

export const TIER_ORDER = ['MEMBER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'] as const;
export const tierAtLeast = (tier: string, minimum: string | null | undefined) =>
  !minimum ||
  TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]) >= TIER_ORDER.indexOf(minimum as (typeof TIER_ORDER)[number]);

export { rankBenefitFor };

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
