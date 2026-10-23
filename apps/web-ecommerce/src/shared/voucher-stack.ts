// Voucher and loyalty rules v6.2 (docs/business/pricing-voucher-specification.md, owner documents of 2026-10-20): one
// main voucher, plus at most one rank benefit, each computed on the same real list price R, behind two profit checks in
// order. Pure whole-VND arithmetic; rates are basis points and rounding is half-up, as the v6.2 SRS requires.
//
//   P10    = ROUND(0.9 × R)                                   goods after the standard 10% member voucher
//   Profit = P × (1 − f) − C − giftCost − FLOOR(P / 40,000) × 1,120
//   L10    = Profit(P10)                                      the standard profit
//   step 1 (voucher alone):  Lplain ≥ 80% L10, ≥ 50,000, ≥ 5% Pplain
//   step 2 (voucher + rank): Lstack ≥ 75% L10, ≥ 50,000, ≥ 5% Pstack, only after step 1 passed
//
// Checkout, the cart, the voucher wallet and the admin pricing tools all use it (through evaluateCheckout in
// src/shared/promotions.ts for the full order of benefits).

export const VOUCHER_RULE_VERSION = 'v6.2';
export const MEMBER10_BPS = 1000;
export const POINT_UNIT_VND = 40_000;

export interface ProfitPolicy {
  // Share of the standard profit L10 to keep, in basis points.
  keepPlainBps: number;
  keepStackBps: number;
  minimumProfitVnd: number;
  minimumMarginBps: number; // of the goods money paid
  feeBps: number; // variable fee on the money received
  pointReserveVnd: number; // provision per point the order will earn
}

export const DEFAULT_PROFIT_POLICY: ProfitPolicy = {
  keepPlainBps: 8000,
  keepStackBps: 7500,
  minimumProfitVnd: 50_000,
  minimumMarginBps: 500,
  feeBps: 0,
  pointReserveVnd: 1_120,
};

export type RankTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'EMERALD' | 'DIAMOND';

export interface RankBenefit {
  tier: RankTier;
  code: string;
  minimumLifetimePoints: number;
  bps: number;
  capVnd: number;
}

// MU-RANK01…06. They replace the retired 2/4/6/10/12/15% tier discounts (MU-TIER02…15) for new orders.
export const RANK_BENEFITS: readonly RankBenefit[] = [
  { tier: 'BRONZE', code: 'MU-RANK01', minimumLifetimePoints: 150, bps: 50, capVnd: 15_000 },
  { tier: 'SILVER', code: 'MU-RANK02', minimumLifetimePoints: 250, bps: 75, capVnd: 25_000 },
  { tier: 'GOLD', code: 'MU-RANK03', minimumLifetimePoints: 500, bps: 100, capVnd: 40_000 },
  { tier: 'PLATINUM', code: 'MU-RANK04', minimumLifetimePoints: 1_500, bps: 125, capVnd: 50_000 },
  { tier: 'EMERALD', code: 'MU-RANK05', minimumLifetimePoints: 3_500, bps: 150, capVnd: 65_000 },
  { tier: 'DIAMOND', code: 'MU-RANK06', minimumLifetimePoints: 10_000, bps: 200, capVnd: 100_000 },
];

// The tier follows lifetime (rank) points, never the spendable balance.
export const rankBenefitFor = (lifetimePoints: number): RankBenefit | null =>
  [...RANK_BENEFITS].reverse().find((rank) => lifetimePoints >= rank.minimumLifetimePoints) ?? null;

export interface StackLine {
  sku: string;
  quantity: number;
  // Approved, really published list price R per unit (the running sale price during a managed sale); null when there is
  // none.
  listPriceVnd: number | null;
  // During a managed sale, the regular list price: the standard profit L10 stays measured on it, so a sale plus a voucher
  // is held to the profit of the regular member price.
  standardListPriceVnd?: number | null;
  // Everything the shop pays for one unit (buy-in, repair, packing, subsidised shipping, fixed fees…); null or 0 is unknown.
  unitCostVnd: number | null;
  // Partner goods take no shop voucher or rank benefit without a funding contract.
  shopOwned: boolean;
  rankEligible?: boolean;
}

// What the caller already checked against the database: ownership, dates, quotas, budget, points to redeem.
export type VoucherAvailability = 'OK' | 'EXPIRED' | 'BUDGET_EXCEEDED' | 'POINTS_INSUFFICIENT' | 'SKU_INELIGIBLE';

export interface MainVoucher {
  code: string;
  kind: 'PERCENT' | 'FIXED';
  bps?: number;
  amountVnd?: number;
  capVnd?: number | null;
  minimumOrderVnd?: number; // compared with R of the eligible lines
  minimumItems?: number;
  // 'single': exactly one product; 'basket': two or more different products.
  cartType?: 'any' | 'single' | 'basket' | null;
  eligibleSkus?: readonly string[] | null;
  excludedSkus?: readonly string[] | null;
  pointsCost?: number; // points spent to issue a point-redemption voucher (already deducted at issue)
  expiresAt?: string | null; // ISO date, tie-break only
  remainingBudgetVnd?: number | null; // tie-break only
  availability?: VoucherAvailability;
}

export type StackStatus = 'VOUCHER_INVALID' | 'VOUCHER_ONLY_VALID' | 'STACK_VALID';

export type StackReason =
  | 'EXPIRED'
  | 'BUDGET_EXCEEDED'
  | 'POINTS_INSUFFICIENT'
  | 'SKU_INELIGIBLE'
  | 'MISSING_DATA'
  | 'MINIMUM_ORDER'
  | 'MINIMUM_ITEMS'
  | 'CART_TYPE'
  | 'NO_STANDARD_PROFIT'
  | 'INSUFFICIENT_PROFIT_80'
  | 'INSUFFICIENT_PROFIT_75'
  | 'MIN_ABSOLUTE_PROFIT'
  | 'MIN_MARGIN';

export interface StackEvaluation {
  ruleVersion: string;
  voucherCode: string;
  status: StackStatus;
  reason: StackReason | null; // why the voucher is invalid
  rankReason: StackReason | null; // why a rank benefit the customer has was not added
  rankCode: string | null; // the rank benefit applied
  listTotalVnd: number; // R of the voucher's eligible lines
  rankBaseVnd: number; // R of the lines both the voucher and the rank benefit accept
  member10TotalVnd: number; // P10
  primaryDiscountVnd: number;
  rankDiscountVnd: number; // applied (0 unless STACK_VALID)
  payableVnd: number; // goods money for the eligible lines after the applied benefits
  earnedPoints: number; // on completion, for the eligible lines
  // Internal, never shown to customers.
  standardProfitVnd: number;
  plainProfitVnd: number;
  stackProfitVnd: number | null;
}

const roundHalfUp = (numerator: number, denominator: number) =>
  Math.floor((2 * numerator + denominator) / (2 * denominator));

export const earnedPoints = (paidEligibleVnd: number) => Math.floor(Math.max(0, paidEligibleVnd) / POINT_UNIT_VND);

export const profitAt = (
  paidVnd: number,
  costVnd: number,
  giftCostVnd: number,
  policy: ProfitPolicy = DEFAULT_PROFIT_POLICY,
) =>
  paidVnd -
  roundHalfUp(paidVnd * policy.feeBps, 10_000) -
  costVnd -
  giftCostVnd -
  earnedPoints(paidVnd) * policy.pointReserveVnd;

// The floors shared by both steps; `keepBps` is the step's share of L10.
const profitFailure = (
  profitVnd: number,
  paidVnd: number,
  standardVnd: number,
  keepBps: number,
  policy: ProfitPolicy,
  ratioReason: StackReason,
): StackReason | null => {
  if (profitVnd * 10_000 < keepBps * standardVnd) return ratioReason;
  if (profitVnd < policy.minimumProfitVnd) return 'MIN_ABSOLUTE_PROFIT';
  if (profitVnd * 10_000 < policy.minimumMarginBps * paidVnd) return 'MIN_MARGIN';
  return null;
};

const inVoucherScope = (voucher: MainVoucher, line: StackLine) =>
  line.shopOwned &&
  line.quantity > 0 &&
  (!voucher.eligibleSkus?.length || voucher.eligibleSkus.includes(line.sku)) &&
  !voucher.excludedSkus?.includes(line.sku);

export const evaluateStack = (input: {
  lines: readonly StackLine[];
  voucher: MainVoucher;
  rank: RankBenefit | null;
  giftCostVnd?: number;
  policy?: ProfitPolicy;
}): StackEvaluation => {
  const { voucher, rank } = input;
  const policy = input.policy ?? DEFAULT_PROFIT_POLICY;
  const giftCostVnd = input.giftCostVnd ?? 0;
  const lines = input.lines.filter((line) => inVoucherScope(voucher, line));
  const value = (line: StackLine) => (line.listPriceVnd ?? 0) * line.quantity;
  const listTotalVnd = lines.reduce((sum, line) => sum + value(line), 0);
  const rankBaseVnd = lines.filter((line) => line.rankEligible !== false).reduce((sum, line) => sum + value(line), 0);
  const costVnd = lines.reduce((sum, line) => sum + (line.unitCostVnd ?? 0) * line.quantity, 0);
  const standardListVnd = lines.reduce(
    (sum, line) => sum + (line.standardListPriceVnd ?? line.listPriceVnd ?? 0) * line.quantity,
    0,
  );
  const member10TotalVnd = roundHalfUp(standardListVnd * (10_000 - MEMBER10_BPS), 10_000);
  // A gift or shop-funded shipping is a cost of the promotion, not of the standard sale: it lowers every profit after a
  // benefit but not L10, so it can never make the ratios easier to meet.
  const standardProfitVnd = profitAt(member10TotalVnd, costVnd, 0, policy);

  const nominal =
    voucher.kind === 'FIXED' ? (voucher.amountVnd ?? 0) : roundHalfUp(listTotalVnd * (voucher.bps ?? 0), 10_000);
  const primaryDiscountVnd = Math.max(0, Math.min(nominal, voucher.capVnd ?? nominal, listTotalVnd));
  const plainPaidVnd = listTotalVnd - primaryDiscountVnd;
  const plainProfitVnd = profitAt(plainPaidVnd, costVnd, giftCostVnd, policy);

  const result = (fields: Partial<StackEvaluation> & Pick<StackEvaluation, 'status'>): StackEvaluation => ({
    ruleVersion: VOUCHER_RULE_VERSION,
    voucherCode: voucher.code,
    reason: null,
    rankReason: null,
    rankCode: null,
    listTotalVnd,
    rankBaseVnd,
    member10TotalVnd,
    primaryDiscountVnd: 0,
    rankDiscountVnd: 0,
    payableVnd: listTotalVnd,
    earnedPoints: earnedPoints(listTotalVnd),
    standardProfitVnd,
    plainProfitVnd,
    stackProfitVnd: null,
    ...fields,
  });
  const invalid = (reason: StackReason) => result({ status: 'VOUCHER_INVALID', reason });

  // Step 1: the voucher alone. Fail closed on anything unknown (BR-018).
  if (voucher.availability && voucher.availability !== 'OK') return invalid(voucher.availability);
  if (!lines.length || listTotalVnd <= 0) return invalid('SKU_INELIGIBLE');
  if (lines.some((line) => !line.listPriceVnd || line.listPriceVnd <= 0 || !line.unitCostVnd || line.unitCostVnd <= 0))
    return invalid('MISSING_DATA');
  if ((voucher.minimumOrderVnd ?? 0) > listTotalVnd) return invalid('MINIMUM_ORDER');
  if ((voucher.minimumItems ?? 0) > lines.reduce((sum, line) => sum + line.quantity, 0))
    return invalid('MINIMUM_ITEMS');
  const products = new Set(lines.map((line) => line.sku)).size;
  if ((voucher.cartType === 'single' && products !== 1) || (voucher.cartType === 'basket' && products < 2))
    return invalid('CART_TYPE');
  if (standardProfitVnd <= 0) return invalid('NO_STANDARD_PROFIT');
  const plainFailure = profitFailure(
    plainProfitVnd,
    plainPaidVnd,
    standardProfitVnd,
    policy.keepPlainBps,
    policy,
    'INSUFFICIENT_PROFIT_80',
  );
  if (plainFailure) return invalid(plainFailure);

  const alone = result({
    status: 'VOUCHER_ONLY_VALID',
    primaryDiscountVnd,
    payableVnd: plainPaidVnd,
    earnedPoints: earnedPoints(plainPaidVnd),
  });
  if (!rank) return alone;
  if (rankBaseVnd <= 0) return { ...alone, rankReason: 'SKU_INELIGIBLE' };

  // Step 2: add the rank benefit on the same R, never on the price after the voucher, never above what is left.
  const rankDiscountVnd = Math.min(roundHalfUp(rankBaseVnd * rank.bps, 10_000), rank.capVnd, plainPaidVnd);
  const stackPaidVnd = Math.max(0, plainPaidVnd - rankDiscountVnd);
  const stackProfitVnd = profitAt(stackPaidVnd, costVnd, giftCostVnd, policy);
  const stackFailure = profitFailure(
    stackProfitVnd,
    stackPaidVnd,
    standardProfitVnd,
    policy.keepStackBps,
    policy,
    'INSUFFICIENT_PROFIT_75',
  );
  if (stackFailure) return { ...alone, rankReason: stackFailure, stackProfitVnd };
  return {
    ...alone,
    status: 'STACK_VALID',
    rankCode: rank.code,
    rankDiscountVnd,
    payableVnd: stackPaidVnd,
    earnedPoints: earnedPoints(stackPaidVnd),
    stackProfitVnd,
  };
};

// The profit the shop keeps with the benefits that would actually apply.
export const appliedProfitVnd = (evaluation: StackEvaluation) =>
  evaluation.status === 'STACK_VALID' ? evaluation.stackProfitVnd! : evaluation.plainProfitVnd;

// Valid options, cheapest for the customer first; ties go to fewer points spent, the earlier expiry, then the smaller
// remaining campaign budget. The customer may still choose any other valid option.
export const rankOptions = (input: {
  lines: readonly StackLine[];
  vouchers: readonly MainVoucher[];
  rank: RankBenefit | null;
  giftCostVnd?: number;
  policy?: ProfitPolicy;
}) => {
  const evaluated = input.vouchers.map((voucher) => ({ voucher, evaluation: evaluateStack({ ...input, voucher }) }));
  const last = Number.MAX_SAFE_INTEGER;
  return evaluated
    .filter((option) => option.evaluation.status !== 'VOUCHER_INVALID')
    .sort(
      (a, b) =>
        a.evaluation.payableVnd - b.evaluation.payableVnd ||
        (a.voucher.pointsCost ?? 0) - (b.voucher.pointsCost ?? 0) ||
        (a.voucher.expiresAt ? Date.parse(a.voucher.expiresAt) : last) -
          (b.voucher.expiresAt ? Date.parse(b.voucher.expiresAt) : last) ||
        (a.voucher.remainingBudgetVnd ?? last) - (b.voucher.remainingBudgetVnd ?? last),
    );
};

// An order carries one main voucher and at most one rank benefit (BR-004).
export const selectionError = (selection: { voucherCodes: readonly string[]; rankCodes: readonly string[] }) =>
  selection.voucherCodes.length > 1 ? 'DUPLICATE_VOUCHER' : selection.rankCodes.length > 1 ? 'DUPLICATE_RANK' : null;

// A larger basket may unlock a better voucher only if it also leaves the shop at least the profit of the original basket
// with its own best option (BR-014); the step ratios are already part of `upsell`'s own evaluation.
export const upsellAllowed = (originalProfitVnd: number, upsell: StackEvaluation) =>
  upsell.status !== 'VOUCHER_INVALID' && appliedProfitVnd(upsell) >= originalProfitVnd;
