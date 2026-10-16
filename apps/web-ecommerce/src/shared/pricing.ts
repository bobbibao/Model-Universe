// Pricing and voucher rules 4.0 (docs/business/pricing-voucher-specification.md). Pure whole-VND arithmetic shared by
// the server (it decides) and the admin calculator (it explains). Four values stay separate:
//   A / C  actual cost (what the shop paid to import or buy back the model, plus costs it carries to resell it)
//   S      target member selling price (what a member pays after the standard 10% voucher)
//   R      list price (the public price vouchers are computed from)
//   L10    standard profit (profit when the customer pays S)
// A voucher above 10% may cost the shop at most 20% of L10 on a single-product order, or 22% on a basket of two or more
// eligible products, and never more than the published cap.

export const PRICING_RULE_VERSION = 'voucher-4.0';
export const STANDARD_MEMBER_PERCENT = 10;
export const VOUCHER_MIN_PERCENT = 8;
export const VOUCHER_MAX_PERCENT = 25;
// Share of the standard profit that must be kept (basis points of L10).
export const KEEP_SINGLE_BP = 8000;
export const KEEP_BASKET_BP = 7800;
// Variable fee on the amount paid (payment, platform), in basis points; 0 until the owner configures one.
export const DEFAULT_FEE_BP = 0;

// Rounding is half-up on whole VND everywhere (ROUND in the specification).
const roundDiv = (numerator: number, denominator: number) => Math.floor((2 * numerator + denominator) / (2 * denominator));
const ceilDiv = (numerator: number, denominator: number) => Math.floor((numerator + denominator - 1) / denominator);

// The member price of a list price: R - ROUND(R × 10%).
export const memberPrice = (listPriceVnd: number, percent = STANDARD_MEMBER_PERCENT): number =>
  listPriceVnd - roundDiv(listPriceVnd * percent, 100);

// The list price R whose member price is exactly S (R ≈ S / 0.9). The closest R with memberPrice(R) = S, or the
// nearest R above when no exact value exists.
export const listPriceForMemberPrice = (targetMemberVnd: number, percent = STANDARD_MEMBER_PERCENT): number => {
  const approximate = roundDiv(targetMemberVnd * 100, 100 - percent);
  for (const delta of [0, -1, 1, -2, 2]) if (memberPrice(approximate + delta, percent) === targetMemberVnd) return approximate + delta;
  let candidate = approximate;
  while (memberPrice(candidate, percent) < targetMemberVnd) candidate++;
  return candidate;
};

export type CartType = 'any' | 'single' | 'basket';

export interface VoucherTerms {
  discountPercent: number;
  fixedAmountVnd?: number | null;
  maxDiscountVnd?: number | null;
  minOrderVnd?: number | null;
  eligibleSkus?: string[] | null;
  excludedSkus?: string[] | null;
  cartType?: CartType | null;
  // Smart vouchers keep the shop's profit floor; other coupons keep their legacy behavior.
  profitGuard?: boolean | null;
}

export interface PricingLine {
  productId: number;
  sku: string;
  // The public price the line is charged at before the voucher (R per unit).
  unitPriceVnd: number;
  quantity: number;
  // Actual cost per unit (C); 0 or less means unknown.
  unitCostVnd: number;
  partnerId?: number | null;
}

export interface PricingRules {
  feeBasisPoints: number;
  minimumProfitVnd: number;
}
export const DEFAULT_RULES: PricingRules = { feeBasisPoints: DEFAULT_FEE_BP, minimumProfitVnd: 0 };

export type VoucherRefusal =
  | 'no_eligible_items'
  | 'minimum_order'
  | 'cart_type'
  | 'missing_cost'
  | 'no_standard_profit'
  | 'profit_floor';

export interface VoucherEvaluation {
  ruleVersion: string;
  eligible: boolean;
  refusal: VoucherRefusal | null;
  basket: boolean;
  eligibleProductIds: number[];
  regularTotalVnd: number; // R of the eligible lines
  standardMemberTotalVnd: number; // S
  costTotalVnd: number; // C
  baselineProfitVnd: number; // L10
  minimumProfitVnd: number; // Lmin
  minimumPaymentVnd: number; // the least the customer may pay for the eligible lines
  maximumSafeDiscountVnd: number;
  nominalDiscountVnd: number; // the percentage before the cap
  discountVnd: number; // what the voucher actually takes off (0 when not eligible)
  customerPaysVnd: number; // for the eligible lines
  actualProfitVnd: number;
  maximumLossBasisPoints: number;
  actualLossBasisPoints: number;
}

const afterFee = (amount: number, rules: PricingRules) => amount - roundDiv(amount * rules.feeBasisPoints, 10_000);

// Lines the voucher can apply to: shop-owned merchandise inside the SKU lists.
export const eligibleLines = (terms: VoucherTerms, lines: PricingLine[]) =>
  lines.filter(
    (line) =>
      !line.partnerId &&
      line.quantity > 0 &&
      (!terms.eligibleSkus?.length || terms.eligibleSkus.includes(line.sku)) &&
      !terms.excludedSkus?.includes(line.sku),
  );

export const nominalDiscount = (terms: VoucherTerms, regularTotalVnd: number) => {
  const percent = terms.fixedAmountVnd ? terms.fixedAmountVnd : roundDiv(regularTotalVnd * terms.discountPercent, 100);
  return Math.max(0, Math.min(percent, regularTotalVnd));
};

// What a voucher does to these lines, with every number the decision used.
export const evaluateVoucher = (
  terms: VoucherTerms,
  lines: PricingLine[],
  rules: PricingRules = DEFAULT_RULES,
): VoucherEvaluation => {
  const eligible = eligibleLines(terms, lines);
  const regularTotalVnd = eligible.reduce((sum, line) => sum + line.unitPriceVnd * line.quantity, 0);
  const standardMemberTotalVnd = eligible.reduce((sum, line) => sum + memberPrice(line.unitPriceVnd) * line.quantity, 0);
  const costTotalVnd = eligible.reduce((sum, line) => sum + Math.max(0, line.unitCostVnd) * line.quantity, 0);
  const basket = new Set(eligible.map((line) => line.productId)).size >= 2;
  const keep = basket ? KEEP_BASKET_BP : KEEP_SINGLE_BP;
  const baselineProfitVnd = afterFee(standardMemberTotalVnd, rules) - costTotalVnd;
  const minimumProfitVnd = Math.max(ceilDiv(Math.max(0, baselineProfitVnd) * keep, 10_000), rules.minimumProfitVnd);
  // P × (1 − f) ≥ C + Lmin  ⇒  P ≥ (C + Lmin) / (1 − f)
  const minimumPaymentVnd = ceilDiv((costTotalVnd + minimumProfitVnd) * 10_000, 10_000 - rules.feeBasisPoints);
  const maximumSafeDiscountVnd = Math.max(0, regularTotalVnd - minimumPaymentVnd);
  const nominal = nominalDiscount(terms, regularTotalVnd);
  const capped = terms.maxDiscountVnd ? Math.min(nominal, terms.maxDiscountVnd) : nominal;
  const customerPays = regularTotalVnd - capped;
  const actualProfitVnd = afterFee(customerPays, rules) - costTotalVnd;
  const lossBp = (profit: number) =>
    baselineProfitVnd > 0 ? Math.max(0, roundDiv((baselineProfitVnd - profit) * 10_000, baselineProfitVnd)) : 10_000;
  let refusal: VoucherRefusal | null = null;
  if (!eligible.length || regularTotalVnd < 1) refusal = 'no_eligible_items';
  else if ((terms.minOrderVnd || 0) > regularTotalVnd) refusal = 'minimum_order';
  else if ((terms.cartType === 'single' && basket) || (terms.cartType === 'basket' && !basket)) refusal = 'cart_type';
  else if (terms.profitGuard && eligible.some((line) => line.unitCostVnd <= 0)) refusal = 'missing_cost';
  else if (terms.profitGuard && baselineProfitVnd <= 0) refusal = 'no_standard_profit';
  else if (terms.profitGuard && actualProfitVnd < minimumProfitVnd) refusal = 'profit_floor';
  const ok = refusal === null;
  return {
    ruleVersion: PRICING_RULE_VERSION,
    eligible: ok,
    refusal,
    basket,
    eligibleProductIds: [...new Set(eligible.map((line) => line.productId))],
    regularTotalVnd,
    standardMemberTotalVnd,
    costTotalVnd,
    baselineProfitVnd,
    minimumProfitVnd,
    minimumPaymentVnd,
    maximumSafeDiscountVnd,
    nominalDiscountVnd: nominal,
    discountVnd: ok ? capped : 0,
    customerPaysVnd: ok ? customerPays : regularTotalVnd,
    actualProfitVnd: ok ? actualProfitVnd : afterFee(regularTotalVnd, rules) - costTotalVnd,
    maximumLossBasisPoints: 10_000 - keep,
    actualLossBasisPoints: lossBp(actualProfitVnd),
  };
};

// The safe voucher range for one product or basket priced at S (member price) with cost C, for the admin calculator.
export const voucherLimits = (
  input: { targetMemberVnd: number; costVnd: number; basket: boolean },
  rules: PricingRules = DEFAULT_RULES,
) => {
  const listPriceVnd = listPriceForMemberPrice(input.targetMemberVnd);
  const baselineProfitVnd = afterFee(input.targetMemberVnd, rules) - input.costVnd;
  const keep = input.basket ? KEEP_BASKET_BP : KEEP_SINGLE_BP;
  const minimumProfitVnd = Math.max(ceilDiv(Math.max(0, baselineProfitVnd) * keep, 10_000), rules.minimumProfitVnd);
  const minimumPaymentVnd = ceilDiv((input.costVnd + minimumProfitVnd) * 10_000, 10_000 - rules.feeBasisPoints);
  const maximumSafeDiscountVnd = Math.max(0, listPriceVnd - minimumPaymentVnd);
  const percents = Array.from({ length: VOUCHER_MAX_PERCENT - VOUCHER_MIN_PERCENT + 1 }, (_, index) => VOUCHER_MIN_PERCENT + index);
  return {
    ruleVersion: PRICING_RULE_VERSION,
    listPriceVnd,
    memberPriceVnd: memberPrice(listPriceVnd),
    baselineProfitVnd,
    minimumProfitVnd,
    minimumPaymentVnd,
    maximumSafeDiscountVnd,
    // Basis points of R, rounded down so the displayed maximum is always safe.
    maximumSafeBasisPoints: listPriceVnd > 0 ? Math.floor((maximumSafeDiscountVnd * 10_000) / listPriceVnd) : 0,
    percents: percents.map((percent) => {
      const discountVnd = roundDiv(listPriceVnd * percent, 100);
      const profitVnd = afterFee(listPriceVnd - discountVnd, rules) - input.costVnd;
      return { percent, discountVnd, profitVnd, allowed: baselineProfitVnd > 0 && profitVnd >= minimumProfitVnd };
    }),
  };
};

export interface VoucherCandidate<T> {
  voucher: T;
  terms: VoucherTerms;
}

// The usable voucher that leaves the customer paying the least; ties keep the earlier (wallet) order. A 25% voucher
// whose cap is lower than a 10% voucher's discount loses to the 10% one.
export const bestVoucher = <T>(candidates: VoucherCandidate<T>[], lines: PricingLine[], rules: PricingRules = DEFAULT_RULES) => {
  let best: { voucher: T; evaluation: VoucherEvaluation } | null = null;
  for (const candidate of candidates) {
    const evaluation = evaluateVoucher(candidate.terms, lines, rules);
    if (evaluation.eligible && evaluation.discountVnd > (best?.evaluation.discountVnd ?? 0)) best = { voucher: candidate.voucher, evaluation };
  }
  return best;
};

// Profit of a whole cart for the shop when the customer pays `discountVnd` less than the list total.
export const cartProfit = (lines: PricingLine[], discountVnd: number, rules: PricingRules = DEFAULT_RULES) => {
  const shop = lines.filter((line) => !line.partnerId);
  const regular = shop.reduce((sum, line) => sum + line.unitPriceVnd * line.quantity, 0);
  const cost = shop.reduce((sum, line) => sum + Math.max(0, line.unitCostVnd) * line.quantity, 0);
  return afterFee(regular - discountVnd, rules) - cost;
};
