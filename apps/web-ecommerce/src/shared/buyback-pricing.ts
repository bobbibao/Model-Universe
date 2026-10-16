// Buyback pricing 2.0 (docs/business/buyback-policy.md): the expected buyback price is the shop's reference selling
// price minus the tier's base deduction, minus 50,000 VND for every recorded ordinary issue. Shared by the server (it
// recomputes every amount) and the client (it shows the estimate while the customer declares the condition). Whole
// VND integers only.

export const BUYBACK_RULE_VERSION = 'buyback-2.0';
export const DEDUCTION_PER_ISSUE_VND = 50_000;

// Inclusive upper bounds. Above the last tier (more than 5,000,000 VND) the shop prices the model manually.
export const BUYBACK_TIERS: readonly { maxReferenceVnd: number; baseDeductionVnd: number }[] = [
  { maxReferenceVnd: 500_000, baseDeductionVnd: 100_000 },
  { maxReferenceVnd: 1_000_000, baseDeductionVnd: 150_000 },
  { maxReferenceVnd: 1_500_000, baseDeductionVnd: 200_000 },
  { maxReferenceVnd: 2_000_000, baseDeductionVnd: 300_000 },
  { maxReferenceVnd: 3_000_000, baseDeductionVnd: 400_000 },
  { maxReferenceVnd: 5_000_000, baseDeductionVnd: 500_000 },
];

// Every ordinary issue costs the same 50,000 VND per counting unit; the unit only says what one issue is.
export const BUYBACK_ISSUE_TYPES = [
  'missing_box', // the whole box is absent: always one issue
  'damaged_box', // one damaged-box condition
  'broken_part', // per broken part
  'cracked_part', // per cracked part
  'missing_accessory', // per missing accessory
  'poor_assembly', // the whole model counts once
  'glue_mark', // per separate glued spot
  'loose_joint', // per loose or broken joint
  'scratch_area', // per independent scratched area
  'missing_decal', // per missing decal item on the checklist
  'missing_detail', // per missing small detail
  'other', // per separate described issue
] as const;
export type BuybackIssueType = (typeof BUYBACK_ISSUE_TYPES)[number];

// Conditions that are one issue for the whole model, however they are counted.
export const SINGLE_UNIT_ISSUES: readonly BuybackIssueType[] = ['missing_box', 'damaged_box', 'poor_assembly'];
export const MAX_ISSUE_QUANTITY = 50;

export interface BuybackIssue {
  type: BuybackIssueType;
  quantity: number;
  description: string;
}

export type ManualReviewReason = 'no_reference_price' | 'above_tier_table' | 'zero_estimate' | 'serious_damage';

export interface BuybackEstimate {
  ruleVersion: string;
  referencePriceVnd: number | null;
  baseDeductionVnd: number | null;
  issueCount: number;
  deductionPerIssueVnd: number;
  issueDeductionVnd: number;
  // null when the shop must price the model manually (manualReview says why).
  estimateVnd: number | null;
  manualReview: ManualReviewReason | null;
}

export const isBuybackIssueType = (value: unknown): value is BuybackIssueType =>
  typeof value === 'string' && (BUYBACK_ISSUE_TYPES as readonly string[]).includes(value);

// The tier's base deduction for a reference price, or null above the table (manual pricing).
export const baseDeduction = (referencePriceVnd: number): number | null =>
  BUYBACK_TIERS.find((tier) => referencePriceVnd <= tier.maxReferenceVnd)?.baseDeductionVnd ?? null;

// Issues of the same type are merged; single-unit conditions never count more than once (a duplicate report of the
// same condition is not charged twice).
export const countIssues = (issues: readonly Pick<BuybackIssue, 'type' | 'quantity'>[]): number => {
  const byType = new Map<BuybackIssueType, number>();
  for (const issue of issues) byType.set(issue.type, (byType.get(issue.type) || 0) + issue.quantity);
  let count = 0;
  for (const [type, quantity] of byType) count += SINGLE_UNIT_ISSUES.includes(type) ? Math.min(1, quantity) : quantity;
  return count;
};

export const estimateBuyback = (
  referencePriceVnd: number | null,
  issues: readonly Pick<BuybackIssue, 'type' | 'quantity'>[],
  options: { seriousDamage?: boolean } = {},
): BuybackEstimate => {
  const issueCount = countIssues(issues);
  const issueDeductionVnd = issueCount * DEDUCTION_PER_ISSUE_VND;
  const base = referencePriceVnd && referencePriceVnd > 0 ? baseDeduction(referencePriceVnd) : null;
  const common = {
    ruleVersion: BUYBACK_RULE_VERSION,
    referencePriceVnd: referencePriceVnd && referencePriceVnd > 0 ? referencePriceVnd : null,
    baseDeductionVnd: base,
    issueCount,
    deductionPerIssueVnd: DEDUCTION_PER_ISSUE_VND,
    issueDeductionVnd,
  };
  if (!common.referencePriceVnd) return { ...common, estimateVnd: null, manualReview: 'no_reference_price' };
  if (base === null) return { ...common, estimateVnd: null, manualReview: 'above_tier_table' };
  const estimateVnd = Math.max(0, common.referencePriceVnd - base - issueDeductionVnd);
  if (options.seriousDamage) return { ...common, estimateVnd, manualReview: 'serious_damage' };
  if (estimateVnd === 0) return { ...common, estimateVnd: null, manualReview: 'zero_estimate' };
  return { ...common, estimateVnd, manualReview: null };
};

export interface InspectionComparison {
  declaredIssueCount: number;
  inspectedIssueCount: number;
  // Issues found that were not declared, and declared issues that do not exist (per type, never negative).
  newIssueCount: number;
  resolvedIssueCount: number;
  initialDeductionVnd: number;
  finalDeductionVnd: number;
  // Positive: the final price is lower than the estimate; negative: higher (declared issues that did not exist).
  deductionDifferenceVnd: number;
}

// Compares the customer's declaration with the inspection both ways, so a declared issue that is not there lowers the
// deduction instead of only ever adding to it.
export const compareInspection = (
  declared: readonly Pick<BuybackIssue, 'type' | 'quantity'>[],
  inspected: readonly Pick<BuybackIssue, 'type' | 'quantity'>[],
): InspectionComparison => {
  const perType = (issues: readonly Pick<BuybackIssue, 'type' | 'quantity'>[]) => {
    const map = new Map<BuybackIssueType, number>();
    for (const type of BUYBACK_ISSUE_TYPES) map.set(type, countIssues(issues.filter((issue) => issue.type === type)));
    return map;
  };
  const before = perType(declared),
    after = perType(inspected);
  let newIssueCount = 0,
    resolvedIssueCount = 0;
  for (const type of BUYBACK_ISSUE_TYPES) {
    const delta = (after.get(type) || 0) - (before.get(type) || 0);
    if (delta > 0) newIssueCount += delta;
    else resolvedIssueCount -= delta;
  }
  const declaredIssueCount = countIssues(declared),
    inspectedIssueCount = countIssues(inspected);
  return {
    declaredIssueCount,
    inspectedIssueCount,
    newIssueCount,
    resolvedIssueCount,
    initialDeductionVnd: declaredIssueCount * DEDUCTION_PER_ISSUE_VND,
    finalDeductionVnd: inspectedIssueCount * DEDUCTION_PER_ISSUE_VND,
    deductionDifferenceVnd: (inspectedIssueCount - declaredIssueCount) * DEDUCTION_PER_ISSUE_VND,
  };
};

// Selling-price candidates that produce a known buyback price B under the tier table (no issues). Several tiers can
// match near a boundary; staff confirm one, and a price outside every candidate is recorded as a separate decision.
export const resaleCandidates = (buybackVnd: number): { sellingPriceVnd: number; baseDeductionVnd: number }[] => {
  const candidates: { sellingPriceVnd: number; baseDeductionVnd: number }[] = [];
  let lower = 0;
  for (const tier of BUYBACK_TIERS) {
    const selling = buybackVnd + tier.baseDeductionVnd;
    if (selling > lower && selling <= tier.maxReferenceVnd)
      candidates.push({ sellingPriceVnd: selling, baseDeductionVnd: tier.baseDeductionVnd });
    lower = tier.maxReferenceVnd;
  }
  return candidates;
};
