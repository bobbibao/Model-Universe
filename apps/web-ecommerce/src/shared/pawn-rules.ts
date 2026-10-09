export interface PawnInterestPolicy {
  dailyRateBasisPoints: 3 | 30;
  dayCount: 'started_days' | 'completed_days';
  rounding: 'ceil' | 'floor' | 'nearest';
  graceDays: number;
  interestStopEvent: 'verified_repayment' | 'asset_handback';
}
export const PAWN_DAY_MS = 24 * 60 * 60 * 1000;
export function validatePawnPolicy(value: Record<string, unknown>): PawnInterestPolicy {
  if (![3, 30].includes(Number(value.dailyRateBasisPoints)) || typeof value.dailyRateBasisPoints !== 'number' || !['started_days', 'completed_days'].includes(String(value.dayCount)) || !['ceil', 'floor', 'nearest'].includes(String(value.rounding)) || !Number.isInteger(value.graceDays) || Number(value.graceDays) < 0 || Number(value.graceDays) > 365 || !['verified_repayment', 'asset_handback'].includes(String(value.interestStopEvent))) throw new Error('Pawn interest, day counting, rounding, grace and accrual stop event require explicit approval.');
  return value as unknown as PawnInterestPolicy;
}
export function validatePawnPrincipal(appraisalVnd: number, principalVnd: number) {
  if (![appraisalVnd, principalVnd].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647) || principalVnd * 100 < appraisalVnd * 50 || principalVnd * 100 > appraisalVnd * 80) throw new Error('Principal must be a whole VND amount between 50% and 80% of the inspected appraisal.');
}
export function pawnInterest(principalVnd: number, policy: PawnInterestPolicy, disbursedAt: Date | null, asOf: Date) {
  if (!Number.isSafeInteger(principalVnd) || principalVnd < 1 || !Number.isFinite(asOf.getTime())) throw new Error('Invalid pawn calculation input.');
  validatePawnPolicy(policy as unknown as Record<string, unknown>);
  if (!disbursedAt) return { days: 0, interestVnd: 0, capped: false };
  if (!Number.isFinite(disbursedAt.getTime())) throw new Error('Invalid disbursement date.');
  const elapsed = Math.max(0, asOf.getTime() - disbursedAt.getTime());
  const days = policy.dayCount === 'started_days' ? Math.ceil(elapsed / PAWN_DAY_MS) : Math.floor(elapsed / PAWN_DAY_MS);
  const denominator = BigInt(10000), numerator = BigInt(principalVnd) * BigInt(policy.dailyRateBasisPoints) * BigInt(days);
  const rounded = policy.rounding === 'ceil' ? (numerator + denominator - BigInt(1)) / denominator : policy.rounding === 'nearest' ? (numerator + denominator / BigInt(2)) / denominator : numerator / denominator;
  const capped = rounded >= BigInt(principalVnd);
  return { days, interestVnd: capped ? principalVnd : Number(rounded), capped };
}
