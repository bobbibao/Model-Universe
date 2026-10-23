import {
  compareInspection,
  countIssues,
  estimateBuyback,
  resaleCandidates,
  type BuybackIssue,
} from '../../src/shared/buyback-pricing';

// Buyback specification chapter XV (TC01–TC25) and chapter IV examples, with the table of the unified rules v5.0
// (tests T1–T9).
const issue = (type: BuybackIssue['type'], quantity: number) => ({ type, quantity });

describe('buyback pricing (v5.0 table)', () => {
  it.each([
    [500_000, 400_000],
    [1_000_000, 800_000],
    [1_500_000, 1_250_000],
    [2_000_000, 1_650_000],
    [3_000_000, 2_550_000],
    [5_000_000, 4_500_000],
  ])('TC01–TC06: a %i VND model without issues is bought at %i VND', (reference, expected) => {
    expect(estimateBuyback(reference, [])).toMatchObject({ estimateVnd: expected, manualReview: null });
  });

  it('uses inclusive tier boundaries (500,001 VND is in the second tier)', () => {
    expect(estimateBuyback(500_001, []).baseDeductionVnd).toBe(200_000);
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

  it('matches the worked examples (1,150,000 / 1,300,000 / 4,250,000 VND)', () => {
    expect(estimateBuyback(1_500_000, [issue('missing_box', 1), issue('broken_part', 1)]).estimateVnd).toBe(1_150_000);
    expect(
      estimateBuyback(2_000_000, [
        issue('missing_box', 1),
        issue('broken_part', 2),
        issue('poor_assembly', 1),
        issue('glue_mark', 1),
        issue('missing_accessory', 2),
      ]).estimateVnd,
    ).toBe(1_300_000);
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

  it('T8: a 900,000 VND buy-in without defects works back to S = 1,150,000 (not 1,100,000)', () => {
    expect(resaleCandidates(900_000)).toEqual([{ sellingPriceVnd: 1_150_000, baseDeductionVnd: 250_000 }]);
  });

  it('a request quoted under an earlier table keeps its base deduction and rule version', () => {
    const quoted = { baseDeductionVnd: 200_000, ruleVersion: 'buyback-2.0' };
    expect(estimateBuyback(1_500_000, [], { quoted })).toMatchObject({ estimateVnd: 1_300_000, ruleVersion: 'buyback-2.0' });
    expect(estimateBuyback(1_500_000, [], { quoted: null })).toMatchObject({ estimateVnd: 1_250_000, ruleVersion: 'buyback-5.0' });
  });

  it('T9: near a boundary every valid S is listed, lowest first', () => {
    expect(resaleCandidates(1_250_000)).toEqual([
      { sellingPriceVnd: 1_500_000, baseDeductionVnd: 250_000 },
      { sellingPriceVnd: 1_600_000, baseDeductionVnd: 350_000 },
    ]);
  });

  it('policy section 4 and 8 examples: 2,000,000 with box, part and two accessories → 1,450,000, then 1,350,000', () => {
    const declared = [issue('missing_box', 1), issue('broken_part', 1), issue('missing_accessory', 2)];
    expect(estimateBuyback(2_000_000, declared).estimateVnd).toBe(1_450_000);
    const inspected = [issue('missing_box', 1), issue('broken_part', 2), issue('missing_accessory', 3)];
    expect(estimateBuyback(2_000_000, inspected).estimateVnd).toBe(1_350_000);
  });
});
