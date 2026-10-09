import { PAWN_DAY_MS, pawnInterest, validatePawnPolicy, validatePawnPrincipal, type PawnInterestPolicy } from '../../src/shared/pawn-rules';

const policy: PawnInterestPolicy = { dailyRateBasisPoints: 3, dayCount: 'completed_days', rounding: 'nearest', graceDays: 3, interestStopEvent: 'verified_repayment' };
const start = new Date('2026-10-08T00:00:00.000Z');
describe('explicit approved pawn calculation rules', () => {
  it('matches the supplied 0.03% daily worked example', () => {
    expect(pawnInterest(1400000, policy, start, new Date(start.getTime() + 30 * PAWN_DAY_MS))).toEqual({ days: 30, interestVnd: 12600, capped: false });
  });
  it('preserves the conflicting 0.3% choice without using it as a default', () => {
    expect(pawnInterest(1400000, { ...policy, dailyRateBasisPoints: 30 }, start, new Date(start.getTime() + 30 * PAWN_DAY_MS)).interestVnd).toBe(126000);
    expect(() => validatePawnPolicy({ dayCount: 'completed_days', rounding: 'nearest', graceDays: 3, interestStopEvent: 'verified_repayment' })).toThrow(/explicit approval/);
  });
  it.each([0, PAWN_DAY_MS, 30 * PAWN_DAY_MS])('charges nothing before actual disbursement (%s ms)', elapsed => {
    expect(pawnInterest(1400000, policy, null, new Date(start.getTime() + elapsed)).interestVnd).toBe(0);
  });
  it.each(['started_days', 'completed_days'] as const)('handles exact day boundaries under %s', dayCount => {
    const chosen = { ...policy, dayCount };
    expect(pawnInterest(1000000, chosen, start, start).days).toBe(0);
    expect(pawnInterest(1000000, chosen, start, new Date(start.getTime() - 1)).days).toBe(0);
    expect(pawnInterest(1000000, chosen, start, new Date(start.getTime() + 1)).days).toBe(dayCount === 'started_days' ? 1 : 0);
    expect(pawnInterest(1000000, chosen, start, new Date(start.getTime() + PAWN_DAY_MS)).days).toBe(1);
    expect(pawnInterest(1000000, chosen, start, new Date(start.getTime() + PAWN_DAY_MS + 1)).days).toBe(dayCount === 'started_days' ? 2 : 1);
  });
  it.each([3, 30] as const)('caps simple interest at principal under %s basis points', dailyRateBasisPoints => {
    const result = pawnInterest(2147483647, { ...policy, dailyRateBasisPoints }, start, new Date(start.getTime() + 10000 * PAWN_DAY_MS));
    expect(result.interestVnd).toBe(2147483647);
    expect(result.capped).toBe(true);
  });
  it.each([['floor', 0], ['nearest', 0], ['ceil', 1]] as const)('uses exact integer %s rounding', (rounding, expected) => {
    expect(pawnInterest(1001, { ...policy, rounding }, start, new Date(start.getTime() + PAWN_DAY_MS)).interestVnd).toBe(expected);
  });
  it('uses actual early-redemption days without charging the entire term', () => {
    expect(pawnInterest(1400000, policy, start, new Date(start.getTime() + 2 * PAWN_DAY_MS)).interestVnd).toBe(840);
  });
  it('requires a specified accrual stop event', () => {
    const { interestStopEvent: _stop, ...incomplete } = policy;
    expect(() => validatePawnPolicy(incomplete)).toThrow(/explicit approval/);
  });
  it.each([500000, 800000])('accepts source principal boundary %s', principal => expect(() => validatePawnPrincipal(1000000, principal)).not.toThrow());
  it.each([499999, 800001, 0, -1, 500000.1])('rejects an invalid principal %s', principal => expect(() => validatePawnPrincipal(1000000, principal)).toThrow(/50% and 80%/));
  it('does not round an odd appraisal into an out-of-range loan', () => {
    expect(() => validatePawnPrincipal(1000001, 500000)).toThrow();
    expect(() => validatePawnPrincipal(1000001, 800001)).toThrow();
    expect(() => validatePawnPrincipal(1000001, 500001)).not.toThrow();
  });
});
