import {
  compareInspection,
  countIssues,
  estimateBuyback,
  resaleCandidates,
  type BuybackIssue,
} from '../../src/shared/buyback-pricing';

// Buyback specification 2.0, chapter XV (TC01–TC25) and the worked examples of chapter IV.
const issue = (type: BuybackIssue['type'], quantity: number) => ({ type, quantity });

describe('buyback pricing 2.0', () => {
  it.each([
    [500_000, 400_000],
    [1_000_000, 850_000],
    [1_500_000, 1_300_000],
    [2_000_000, 1_700_000],
    [3_000_000, 2_600_000],
    [5_000_000, 4_500_000],
  ])('TC01–TC06: a %i VND model without issues is bought at %i VND', (reference, expected) => {
    expect(estimateBuyback(reference, [])).toMatchObject({ estimateVnd: expected, manualReview: null });
  });

  it('uses inclusive tier boundaries (500,001 VND is in the second tier)', () => {
    expect(estimateBuyback(500_001, []).baseDeductionVnd).toBe(150_000);
  });

  it.each([
    ['TC07 missing box', [issue('missing_box', 1)], 50_000],
    ['TC08 poor assembly', [issue('poor_assembly', 1)], 50_000],
    ['TC09 two broken parts', [issue('broken_part', 2)], 100_000],
    ['TC10 three missing accessories', [issue('missing_accessory', 3)], 150_000],
    ['TC11 glue in two places', [issue('glue_mark', 2)], 100_000],
    ['TC12 three other issues', [issue('other', 3)], 150_000],
  ])('%s deducts %i VND', (_, issues, deduction) => {
    expect(estimateBuyback(2_000_000, issues).issueDeductionVnd).toBe(deduction);
  });

  it('TC13: a whole-model condition reported twice is charged once', () => {
    expect(countIssues([issue('missing_box', 1), issue('missing_box', 1), issue('poor_assembly', 3)])).toBe(2);
  });

  it('matches the worked examples (1,200,000 / 1,350,000 / 4,250,000 VND)', () => {
    expect(estimateBuyback(1_500_000, [issue('missing_box', 1), issue('broken_part', 1)]).estimateVnd).toBe(1_200_000);
    expect(
      estimateBuyback(2_000_000, [
        issue('missing_box', 1),
        issue('broken_part', 2),
        issue('poor_assembly', 1),
        issue('glue_mark', 1),
        issue('missing_accessory', 2),
      ]).estimateVnd,
    ).toBe(1_350_000);
    expect(estimateBuyback(5_000_000, [issue('broken_part', 2), issue('missing_accessory', 3)]).estimateVnd).toBe(4_250_000);
  });

  it('TC24/TC25: serious damage, missing reference and prices above 5 million go to manual pricing', () => {
    expect(estimateBuyback(2_000_000, [], { seriousDamage: true }).manualReview).toBe('serious_damage');
    expect(estimateBuyback(5_000_001, []).manualReview).toBe('above_tier_table');
    expect(estimateBuyback(null, []).manualReview).toBe('no_reference_price');
    expect(estimateBuyback(500_000, [issue('other', 8)])).toMatchObject({ estimateVnd: null, manualReview: 'zero_estimate' });
  });

  it('TC17/TC18: the inspection adjusts both ways', () => {
    const declared = [issue('missing_box', 1), issue('broken_part', 2)];
    const added = compareInspection(declared, [...declared, issue('missing_accessory', 1)]);
    expect(added).toMatchObject({ newIssueCount: 1, resolvedIssueCount: 0, deductionDifferenceVnd: 50_000 });
    const fewer = compareInspection(declared, [issue('broken_part', 1)]);
    expect(fewer).toMatchObject({ newIssueCount: 0, resolvedIssueCount: 2, deductionDifferenceVnd: -100_000 });
  });

  it('derives resale candidates from a buyback price (900,000 VND → 1,100,000 VND)', () => {
    expect(resaleCandidates(900_000)).toEqual([{ sellingPriceVnd: 1_100_000, baseDeductionVnd: 200_000 }]);
  });
});
