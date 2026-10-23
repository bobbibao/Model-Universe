import {
  appliedProfitVnd,
  earnedPoints,
  evaluateStack,
  rankBenefitFor,
  rankOptions,
  RANK_BENEFITS,
  selectionError,
  upsellAllowed,
  type MainVoucher,
  type StackLine,
} from '../../src/shared/voucher-stack';
import { baseDeduction } from '../../src/shared/buyback-pricing';

// Voucher & loyalty v6.2 acceptance tests (docs/business/source/vi/voucher-loyalty-v6.2-rules-and-tests.md §6–7).
// Every R here is a test assumption R = ROUND(S / 0.9), never a real list price; C = B and no fee unless stated.

// The DRAFT code library of the v6.2 rules §4 and appendix 13. Fixtures only: none of these codes is live.
const draft = {
  WELCOME08: { code: 'MU-WELCOME08', kind: 'PERCENT', bps: 800, capVnd: 100_000, minimumOrderVnd: 300_000 },
  MEMBER10: { code: 'MU-MEMBER10', kind: 'PERCENT', bps: 1000, minimumOrderVnd: 500_000 },
  KIT12: { code: 'MU-KIT12', kind: 'PERCENT', bps: 1200, capVnd: 500_000, minimumOrderVnd: 800_000 },
  CART14: { code: 'MU-CART14', kind: 'PERCENT', bps: 1400, capVnd: 280_000, minimumOrderVnd: 1_200_000 },
  BUNDLE16: {
    code: 'MU-BUNDLE16',
    kind: 'PERCENT',
    bps: 1600,
    capVnd: 500_000,
    minimumOrderVnd: 2_000_000,
    minimumItems: 2,
  },
  EVENT18: { code: 'MU-EVENT18', kind: 'PERCENT', bps: 1800, capVnd: 650_000, minimumOrderVnd: 2_500_000 },
  VIP20: { code: 'MU-VIP20', kind: 'PERCENT', bps: 2000, capVnd: 800_000, minimumOrderVnd: 3_000_000 },
  VIP22: { code: 'MU-VIP22', kind: 'PERCENT', bps: 2200, capVnd: 900_000, minimumOrderVnd: 4_000_000 },
  FLASH25: {
    code: 'MU-FLASH25',
    kind: 'PERCENT',
    bps: 2500,
    capVnd: 1_000_000,
    minimumOrderVnd: 5_000_000,
    minimumItems: 2,
  },
  POINT100: { code: 'MU-POINT100', kind: 'FIXED', amountVnd: 100_000, minimumOrderVnd: 1_000_000, pointsCost: 110 },
} satisfies Record<string, MainVoucher>;

const DIAMOND = RANK_BENEFITS.find((rank) => rank.tier === 'DIAMOND')!;
const line = (
  listPriceVnd: number | null,
  unitCostVnd: number | null,
  overrides: Partial<StackLine> = {},
): StackLine => ({
  sku: 'SKU-1',
  quantity: 1,
  listPriceVnd,
  unitCostVnd,
  shopOwned: true,
  ...overrides,
});
const listFor = (s: number) => Math.floor((2 * s * 10 + 9) / 18); // ROUND(S / 0.9)

describe('v6.2 baseline (TC01–TC06)', () => {
  it.each([
    [500_000, 400_000, 555_556, 12, 86_560],
    [1_000_000, 800_000, 1_111_111, 25, 172_000],
    [1_500_000, 1_250_000, 1_666_667, 37, 208_560],
    [2_000_000, 1_650_000, 2_222_222, 50, 294_000],
    [3_000_000, 2_550_000, 3_333_333, 75, 366_000],
    [5_000_000, 4_500_000, 5_555_556, 125, 360_000],
  ])('S %i / B %i: R %i, MEMBER10 pays S, %i points, L10 %i', (s, b, r, points, l10) => {
    expect(listFor(s)).toBe(r);
    expect(b).toBe(s - baseDeduction(s)!); // the v5.0 buy-back table links S and B
    const result = evaluateStack({ lines: [line(r, b)], voucher: draft.MEMBER10, rank: null });
    expect(result).toMatchObject({
      status: 'VOUCHER_ONLY_VALID',
      payableVnd: s,
      earnedPoints: points,
      standardProfitVnd: l10,
    });
    expect(result.plainProfitVnd).toBe(l10);
  });
});

describe('step 1 and step 2', () => {
  it('TC07: KIT12 alone at R 1,666,667 keeps 84.55% and passes', () => {
    const result = evaluateStack({ lines: [line(1_666_667, 1_250_000)], voucher: draft.KIT12, rank: null });
    expect(result).toMatchObject({
      status: 'VOUCHER_ONLY_VALID',
      primaryDiscountVnd: 200_000,
      payableVnd: 1_466_667,
      earnedPoints: 36,
      plainProfitVnd: 176_347,
    });
    expect(Math.floor((result.plainProfitVnd * 10_000) / result.standardProfitVnd)).toBe(8455);
  });

  it('TC08 / TC21: KIT12 + Diamond keeps 69.11%, so the rank is refused and KIT12 stays alone', () => {
    const result = evaluateStack({ lines: [line(1_666_667, 1_250_000)], voucher: draft.KIT12, rank: DIAMOND });
    expect(result).toMatchObject({
      status: 'VOUCHER_ONLY_VALID',
      rankReason: 'INSUFFICIENT_PROFIT_75',
      rankDiscountVnd: 0,
      payableVnd: 1_466_667,
      stackProfitVnd: 144_134,
    });
  });

  it('TC09 / TC23: KIT12 + Diamond at R 1,111,111 is recomputed and stacks (75.46%), both discounts on the same R', () => {
    const result = evaluateStack({ lines: [line(1_111_111, 800_000)], voucher: draft.KIT12, rank: DIAMOND });
    expect(result.plainProfitVnd).toBe(150_898);
    expect(result).toMatchObject({
      status: 'STACK_VALID',
      rankCode: 'MU-RANK06',
      primaryDiscountVnd: 133_333,
      rankDiscountVnd: 22_222,
      payableVnd: 1_111_111 - 133_333 - 22_222,
      earnedPoints: 23,
      stackProfitVnd: 129_796,
    });
  });

  it('TC10 / TC22: 14% at R 1,666,667 fails alone, and no stack is tried', () => {
    const result = evaluateStack({ lines: [line(1_666_667, 1_250_000)], voucher: draft.CART14, rank: DIAMOND });
    expect(result).toMatchObject({ status: 'VOUCHER_INVALID', reason: 'INSUFFICIENT_PROFIT_80', stackProfitVnd: null });
    expect(result.plainProfitVnd).toBe(144_134);
  });

  it('TC11: 14% capped at 280,000 on R 2,222,222 passes alone (81.11%)', () => {
    expect(evaluateStack({ lines: [line(2_222_222, 1_650_000)], voucher: draft.CART14, rank: null })).toMatchObject({
      status: 'VOUCHER_ONLY_VALID',
      primaryDiscountVnd: 280_000,
      payableVnd: 1_942_222,
      earnedPoints: 48,
      plainProfitVnd: 238_462,
    });
  });

  it('TC12: 12% on R 3,333,333 passes alone (82.40%)', () => {
    expect(evaluateStack({ lines: [line(3_333_333, 2_550_000)], voucher: draft.KIT12, rank: null })).toMatchObject({
      payableVnd: 2_933_333,
      earnedPoints: 73,
      plainProfitVnd: 301_573,
    });
  });

  it('TC14: FLASH25 on a low-margin 5,555,556 basket loses money and is refused', () => {
    const lines = [line(2_777_778, 2_250_000, { sku: 'A' }), line(2_777_778, 2_250_000, { sku: 'B' })];
    const result = evaluateStack({ lines, voucher: draft.FLASH25, rank: null });
    expect(result).toMatchObject({
      status: 'VOUCHER_INVALID',
      reason: 'INSUFFICIENT_PROFIT_80',
      primaryDiscountVnd: 0,
    });
    expect(result.plainProfitVnd).toBe(-71_004);
  });

  it('TC15: FLASH25 on a high-margin two-item 6,000,000 basket passes alone (85.86%)', () => {
    const lines = [line(3_000_000, 1_250_000, { sku: 'A' }), line(3_000_000, 1_250_000, { sku: 'B' })];
    expect(evaluateStack({ lines, voucher: draft.FLASH25, rank: null })).toMatchObject({
      status: 'VOUCHER_ONLY_VALID',
      standardProfitVnd: 2_748_800,
      payableVnd: 5_000_000,
      earnedPoints: 125,
      plainProfitVnd: 2_360_000,
    });
    expect(evaluateStack({ lines: lines.slice(0, 1), voucher: draft.FLASH25, rank: null }).reason).toBe(
      'MINIMUM_ORDER',
    );
    expect(evaluateStack({ lines: [line(6_000_000, 2_500_000)], voucher: draft.FLASH25, rank: null }).reason).toBe(
      'MINIMUM_ITEMS',
    );
  });

  it('a capped rank benefit never exceeds its cap: MEMBER10 + Diamond at S 5,000,000 takes 100,000 and keeps 73.16%', () => {
    const result = evaluateStack({ lines: [line(5_555_556, 4_500_000)], voucher: draft.MEMBER10, rank: DIAMOND });
    expect(result).toMatchObject({
      status: 'VOUCHER_ONLY_VALID',
      rankReason: 'INSUFFICIENT_PROFIT_75',
      stackProfitVnd: 263_360,
    });
  });

  it('the floors apply even when the ratio passes: 50,000 VND and 5% of the goods paid', () => {
    const tiny = evaluateStack({ lines: [line(555_556, 480_000)], voucher: draft.MEMBER10, rank: null });
    expect(tiny.reason).toBe('MIN_ABSOLUTE_PROFIT');
    const policy = {
      keepPlainBps: 8000,
      keepStackBps: 7500,
      minimumProfitVnd: 0,
      minimumMarginBps: 1_800,
      feeBps: 0,
      pointReserveVnd: 1_120,
    };
    expect(
      evaluateStack({ lines: [line(1_111_111, 800_000)], voucher: draft.MEMBER10, rank: null, policy }).reason,
    ).toBe('MIN_MARGIN');
  });

  it('a variable fee lowers every profit figure', () => {
    const noFee = evaluateStack({ lines: [line(2_222_222, 1_650_000)], voucher: draft.CART14, rank: null });
    const policy = {
      keepPlainBps: 8000,
      keepStackBps: 7500,
      minimumProfitVnd: 50_000,
      minimumMarginBps: 500,
      feeBps: 300,
      pointReserveVnd: 1_120,
    };
    const fee = evaluateStack({ lines: [line(2_222_222, 1_650_000)], voucher: draft.CART14, rank: null, policy });
    expect(fee.standardProfitVnd).toBe(294_000 - 60_000);
    expect(fee.plainProfitVnd).toBe(238_462 - 58_267);
    expect(noFee.status).toBe('VOUCHER_ONLY_VALID');
    expect(fee.status).toBe('VOUCHER_INVALID'); // 180,195 < 80% of 234,000
  });
});

describe('choosing among options', () => {
  it('TC13: KIT12 capped at 500,000 is valid on R 5,555,556 but MEMBER10 is cheaper and comes first', () => {
    const options = rankOptions({
      lines: [line(5_555_556, 4_500_000)],
      vouchers: [draft.KIT12, draft.MEMBER10],
      rank: null,
    });
    expect(options.map((option) => [option.voucher.code, option.evaluation.payableVnd])).toEqual([
      ['MU-MEMBER10', 5_000_000],
      ['MU-KIT12', 5_055_556],
    ]);
  });

  it('TC16: the free MEMBER10 comes before spending 110 points on a 100,000 voucher', () => {
    const options = rankOptions({
      lines: [line(1_111_111, 800_000)],
      vouchers: [draft.POINT100, draft.MEMBER10],
      rank: null,
    });
    expect(options.map((option) => [option.voucher.code, option.evaluation.payableVnd])).toEqual([
      ['MU-MEMBER10', 1_000_000],
      ['MU-POINT100', 1_011_111],
    ]);
  });

  it('ties go to fewer points spent, then the earlier expiry', () => {
    const fixed = { code: 'A', kind: 'FIXED', amountVnd: 111_111 } as const;
    const options = rankOptions({
      lines: [line(1_111_111, 800_000)],
      vouchers: [
        { ...fixed, code: 'LATE', expiresAt: '2026-12-31T00:00:00Z' },
        { ...fixed, code: 'POINTS', pointsCost: 50 },
        { ...fixed, code: 'SOON', expiresAt: '2026-11-01T00:00:00Z' },
      ],
      rank: null,
    });
    expect(options.map((option) => option.voucher.code)).toEqual(['SOON', 'LATE', 'POINTS']);
  });

  it('a point voucher may take a rank benefit like any other main voucher', () => {
    const result = evaluateStack({ lines: [line(2_222_222, 1_300_000)], voucher: draft.POINT100, rank: DIAMOND });
    expect(result).toMatchObject({ status: 'STACK_VALID', primaryDiscountVnd: 100_000, rankDiscountVnd: 44_444 });
  });

  it('TC24: two main vouchers or two rank benefits on one order are refused', () => {
    expect(selectionError({ voucherCodes: ['MU-KIT12', 'MU-MEMBER10'], rankCodes: [] })).toBe('DUPLICATE_VOUCHER');
    expect(selectionError({ voucherCodes: ['MU-KIT12'], rankCodes: ['MU-RANK05', 'MU-RANK06'] })).toBe(
      'DUPLICATE_RANK',
    );
    expect(selectionError({ voucherCodes: ['MU-KIT12'], rankCodes: ['MU-RANK06'] })).toBeNull();
  });

  it('TC30: an upsell is allowed only if the new basket earns at least the original profit', () => {
    const original = evaluateStack({ lines: [line(1_111_111, 800_000)], voucher: draft.MEMBER10, rank: null });
    const bigger = evaluateStack({
      lines: [line(1_111_111, 800_000, { sku: 'A' }), line(1_111_111, 800_000, { sku: 'B' })],
      voucher: draft.CART14,
      rank: null,
    });
    expect(upsellAllowed(appliedProfitVnd(original), bigger)).toBe(true);
    expect(upsellAllowed(appliedProfitVnd(bigger) + 1, bigger)).toBe(false);
  });
});

describe('fail closed and eligibility', () => {
  it('TC17 / TC18: availability problems found by the caller make the voucher invalid whatever the profit', () => {
    for (const availability of ['POINTS_INSUFFICIENT', 'EXPIRED', 'BUDGET_EXCEEDED'] as const)
      expect(
        evaluateStack({ lines: [line(1_111_111, 800_000)], voucher: { ...draft.MEMBER10, availability }, rank: null }),
      ).toMatchObject({
        status: 'VOUCHER_INVALID',
        reason: availability,
        payableVnd: 1_111_111,
      });
    expect(
      evaluateStack({
        lines: [line(1_111_111, 800_000)],
        voucher: { ...draft.MEMBER10, excludedSkus: ['SKU-1'] },
        rank: null,
      }).reason,
    ).toBe('SKU_INELIGIBLE');
  });

  it('TC19 / BR-018: an unverified list price or unknown cost blocks the voucher', () => {
    expect(evaluateStack({ lines: [line(null, 800_000)], voucher: draft.MEMBER10, rank: null }).reason).toBe(
      'SKU_INELIGIBLE',
    );
    expect(evaluateStack({ lines: [line(1_111_111, null)], voucher: draft.MEMBER10, rank: null }).reason).toBe(
      'MISSING_DATA',
    );
    const mixed = [line(1_111_111, 800_000), line(null, 500_000, { sku: 'SKU-2' })];
    expect(evaluateStack({ lines: mixed, voucher: draft.MEMBER10, rank: null }).reason).toBe('MISSING_DATA');
  });

  it('a basket whose standard profit is not positive is blocked', () => {
    expect(evaluateStack({ lines: [line(1_111_111, 1_100_000)], voucher: draft.MEMBER10, rank: null }).reason).toBe(
      'NO_STANDARD_PROFIT',
    );
  });

  it('partner goods take no shop voucher (BR-015)', () => {
    expect(
      evaluateStack({ lines: [line(1_111_111, 800_000, { shopOwned: false })], voucher: draft.MEMBER10, rank: null })
        .reason,
    ).toBe('SKU_INELIGIBLE');
  });

  it('uneven eligibility: the rank benefit is computed only on the lines it accepts', () => {
    const lines = [
      line(2_222_222, 1_300_000, { sku: 'A' }),
      line(1_111_111, 650_000, { sku: 'B', rankEligible: false }),
    ];
    const result = evaluateStack({ lines, voucher: draft.MEMBER10, rank: DIAMOND });
    expect(result.rankBaseVnd).toBe(2_222_222);
    expect(result.rankDiscountVnd).toBe(44_444);
    const none = evaluateStack({ lines: lines.slice(1), voucher: draft.MEMBER10, rank: DIAMOND });
    expect(none).toMatchObject({ status: 'VOUCHER_ONLY_VALID', rankReason: 'SKU_INELIGIBLE' });
  });
});

describe('checkout inputs', () => {
  it('honours the cart type: one product, or two different products', () => {
    const single = [line(1_111_111, 800_000)];
    const two = [line(1_111_111, 800_000, { sku: 'A' }), line(1_111_111, 800_000, { sku: 'B' })];
    expect(evaluateStack({ lines: two, voucher: { ...draft.MEMBER10, cartType: 'single' }, rank: null }).reason).toBe(
      'CART_TYPE',
    );
    expect(
      evaluateStack({ lines: single, voucher: { ...draft.MEMBER10, cartType: 'basket' }, rank: null }).reason,
    ).toBe('CART_TYPE');
    expect(evaluateStack({ lines: two, voucher: { ...draft.MEMBER10, cartType: 'basket' }, rank: null }).status).toBe(
      'VOUCHER_ONLY_VALID',
    );
  });

  it('measures the standard profit on the regular list price during a sale', () => {
    // Regular R 1,111,111 on sale at 1,000,000: L10 stays 172,000, so 12% more off the sale price fails alone.
    const onSale = [line(1_000_000, 800_000, { standardListPriceVnd: 1_111_111 })];
    const result = evaluateStack({ lines: onSale, voucher: draft.KIT12, rank: null });
    expect(result.standardProfitVnd).toBe(172_000);
    expect(result).toMatchObject({ status: 'VOUCHER_INVALID', reason: 'INSUFFICIENT_PROFIT_80' });
  });

  it('counts a gift or shop-paid shipping in every profit after a benefit, never in L10', () => {
    const result = evaluateStack({
      lines: [line(1_111_111, 800_000)],
      voucher: draft.MEMBER10,
      rank: null,
      giftCostVnd: 30_000,
    });
    expect(result.standardProfitVnd).toBe(172_000);
    expect(result.plainProfitVnd).toBe(142_000);
  });
});

describe('points and tiers', () => {
  it('earns one point per whole 40,000 VND (39,999 → 0, 40,000 → 1)', () => {
    expect([earnedPoints(39_999), earnedPoints(40_000), earnedPoints(0), earnedPoints(-5)]).toEqual([0, 1, 0, 0]);
  });

  it('tiers follow lifetime points', () => {
    expect(
      [149, 150, 250, 500, 1_500, 3_500, 9_999, 10_000].map((points) => rankBenefitFor(points)?.code ?? null),
    ).toEqual([null, 'MU-RANK01', 'MU-RANK02', 'MU-RANK03', 'MU-RANK04', 'MU-RANK05', 'MU-RANK05', 'MU-RANK06']);
  });
});

describe('QA matrix: 6 price levels × 6 tiers × 9 main vouchers', () => {
  const levels = [500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000];
  const mains = [
    draft.WELCOME08,
    draft.MEMBER10,
    draft.KIT12,
    draft.CART14,
    draft.BUNDLE16,
    draft.EVENT18,
    draft.VIP20,
    draft.VIP22,
    draft.FLASH25,
  ];
  const cases = levels.flatMap((s) => RANK_BENEFITS.flatMap((rank) => mains.map((voucher) => ({ s, rank, voucher }))));

  it('has 324 combinations', () => expect(cases).toHaveLength(324));

  it.each(cases.map((item) => [item.s, item.rank.code, item.voucher.code, item] as const))(
    'S %i, %s, %s: stack only after the voucher passes alone, never below the floors',
    (s, _rank, _code, { rank, voucher }) => {
      const r = listFor(s);
      const lines = [
        line(r - Math.floor(r / 2), s - baseDeduction(s)! - Math.floor((s - baseDeduction(s)!) / 2), { sku: 'A' }),
        line(Math.floor(r / 2), Math.floor((s - baseDeduction(s)!) / 2), { sku: 'B' }),
      ];
      const alone = evaluateStack({ lines, voucher, rank: null });
      const result = evaluateStack({ lines, voucher, rank });
      expect(result.status === 'VOUCHER_INVALID').toBe(alone.status === 'VOUCHER_INVALID');
      expect(result.primaryDiscountVnd + result.rankDiscountVnd).toBeLessThanOrEqual(result.listTotalVnd);
      expect(result.payableVnd).toBeGreaterThanOrEqual(0);
      if (result.status === 'VOUCHER_INVALID') {
        expect(result.rankDiscountVnd).toBe(0);
        expect(result.stackProfitVnd).toBeNull();
        return;
      }
      expect(result.plainProfitVnd * 10_000).toBeGreaterThanOrEqual(8000 * result.standardProfitVnd);
      expect(result.plainProfitVnd).toBeGreaterThanOrEqual(50_000);
      if (result.status === 'STACK_VALID') {
        expect(result.rankDiscountVnd).toBeLessThanOrEqual(rank.capVnd);
        expect(result.stackProfitVnd! * 10_000).toBeGreaterThanOrEqual(7500 * result.standardProfitVnd);
        expect(result.stackProfitVnd!).toBeGreaterThanOrEqual(50_000);
        expect(result.stackProfitVnd! * 10_000).toBeGreaterThanOrEqual(500 * result.payableVnd);
      }
    },
  );
});
