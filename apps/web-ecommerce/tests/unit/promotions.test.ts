import {
  checkinReward,
  earnedPoints,
  evaluateCheckout,
  spendForPoints,
  wheelPrize,
  WHEEL_PRIZES,
} from '../../src/shared/promotions';
import { RANK_BENEFITS, type MainVoucher, type StackLine } from '../../src/shared/voucher-stack';

// Checkout benefits under the rules v6.2. A model at R 1,111,111 with cost 800,000 (the v6.2 TC09 case): the member
// 10% code leaves 1,000,000 and the standard profit L10 = 172,000 after the 1,120 VND per point reserve.
const line = (overrides: Partial<StackLine> = {}): StackLine => ({
  sku: 'KIT-1',
  quantity: 1,
  listPriceVnd: 1_111_111,
  unitCostVnd: 800_000,
  shopOwned: true,
  ...overrides,
});
const MEMBER10: MainVoucher = { code: 'M2610-1', kind: 'PERCENT', bps: 1000 };
const DIAMOND = RANK_BENEFITS.find((rank) => rank.tier === 'DIAMOND')!;
const FREESHIP = { minOrderVnd: 500_000, maxShippingVnd: 30_000 };

describe('one main voucher, one rank benefit, free shipping inside the checks', () => {
  it('adds the rank benefit on the same list price when both checks pass', () => {
    const result = evaluateCheckout({
      lines: [line()],
      voucher: MEMBER10,
      rank: DIAMOND,
      freeship: null,
      shippingFeeVnd: 0,
    });
    expect(result).toMatchObject({
      voucherDiscountVnd: 111_111,
      rankDiscountVnd: 22_222,
      rankCode: 'MU-RANK06',
      rankRefusal: null,
      discountVnd: 133_333,
    });
    expect(result.evaluation?.status).toBe('STACK_VALID');
  });

  it('refuses free shipping rather than drop an accepted rank benefit', () => {
    const result = evaluateCheckout({
      lines: [line()],
      voucher: MEMBER10,
      rank: DIAMOND,
      freeship: FREESHIP,
      shippingFeeVnd: 30_000,
    });
    expect(result).toMatchObject({
      rankDiscountVnd: 22_222,
      shippingDiscountVnd: 0,
      freeshipRefusal: 'INSUFFICIENT_PROFIT_75',
    });
  });

  it('counts the shipping it pays as a cost and accepts it while the voucher still passes', () => {
    const result = evaluateCheckout({
      lines: [line()],
      voucher: MEMBER10,
      rank: null,
      freeship: FREESHIP,
      shippingFeeVnd: 45_000,
    });
    expect(result).toMatchObject({ voucherDiscountVnd: 111_111, shippingDiscountVnd: 30_000, freeshipRefusal: null });
    expect(result.evaluation?.plainProfitVnd).toBe(172_000 - 30_000);
  });

  it('refuses a voucher that fails alone and never tries the rank benefit on it', () => {
    const result = evaluateCheckout({
      lines: [line()],
      voucher: { code: 'BIG25', kind: 'PERCENT', bps: 2500 },
      rank: DIAMOND,
      freeship: FREESHIP,
      shippingFeeVnd: 30_000,
    });
    expect(result).toMatchObject({
      voucherRefusal: 'INSUFFICIENT_PROFIT_80',
      voucherDiscountVnd: 0,
      rankDiscountVnd: 0,
      evaluation: null,
      // Free shipping is still checked on its own.
      shippingDiscountVnd: 30_000,
    });
  });

  it('takes an approved agent code as given, without a rank benefit', () => {
    const result = evaluateCheckout({
      lines: [line()],
      voucher: null,
      approvedVoucher: { code: 'AI-SALE', discountVnd: 50_000 },
      rank: DIAMOND,
      freeship: null,
      shippingFeeVnd: 0,
    });
    expect(result).toMatchObject({ voucherDiscountVnd: 50_000, rankDiscountVnd: 0, discountVnd: 50_000 });
  });

  it('gives partner goods and goods without a cost no shop benefit', () => {
    expect(
      evaluateCheckout({
        lines: [line({ shopOwned: false })],
        voucher: MEMBER10,
        rank: null,
        freeship: FREESHIP,
        shippingFeeVnd: 30_000,
      }),
    ).toMatchObject({ voucherRefusal: 'SKU_INELIGIBLE', freeshipRefusal: 'SKU_INELIGIBLE' });
    expect(
      evaluateCheckout({
        lines: [line({ unitCostVnd: 0 })],
        voucher: null,
        rank: null,
        freeship: FREESHIP,
        shippingFeeVnd: 30_000,
      }),
    ).toMatchObject({ freeshipRefusal: 'MISSING_DATA' });
  });

  it('explains a free-shipping code that cannot apply yet', () => {
    expect(
      evaluateCheckout({ lines: [line()], voucher: null, rank: null, freeship: FREESHIP, shippingFeeVnd: 0 })
        .freeshipRefusal,
    ).toBe('NO_SHIPPING_FEE');
    expect(
      evaluateCheckout({
        lines: [line({ listPriceVnd: 400_000, unitCostVnd: 200_000 })],
        voucher: null,
        rank: null,
        freeship: FREESHIP,
        shippingFeeVnd: 30_000,
      }).freeshipRefusal,
    ).toBe('MINIMUM_ORDER');
  });
});

describe('points and engagement', () => {
  it('earns one point per whole 40,000 VND, whatever the tier', () => {
    expect(earnedPoints(4_000_000)).toBe(100);
    expect(earnedPoints(39_999)).toBe(0);
  });

  it('turns the points to the next tier into a spend', () => {
    expect(spendForPoints(150)).toBe(6_000_000);
    expect(spendForPoints(0)).toBe(0);
    expect(earnedPoints(spendForPoints(149))).toBe(149);
  });

  it('rewards a seven-day check-in streak and restarts the cycle', () => {
    expect(checkinReward(1)).toEqual({ day: 1, points: 1, freeship: false });
    expect(checkinReward(7)).toEqual({ day: 7, points: 5, freeship: true });
    expect(checkinReward(8)).toEqual({ day: 1, points: 1, freeship: false });
  });

  it('draws every wheel prize in proportion to its weight', () => {
    expect(WHEEL_PRIZES.reduce((sum, entry) => sum + entry.weight, 0)).toBe(1_000);
    expect(wheelPrize(0).index).toBe(0);
    expect(wheelPrize(999).index).toBe(WHEEL_PRIZES.length - 1);
  });
});
