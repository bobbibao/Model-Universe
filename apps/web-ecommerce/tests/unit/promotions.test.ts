import { listPriceForMemberPrice, type PricingLine } from '../../src/shared/pricing';
import {
  POINT_VALUE_VND,
  checkinReward,
  earnedPoints,
  evaluateStack,
  spendForPoints,
  wheelPrize,
  WHEEL_PRIZES,
} from '../../src/shared/promotions';

// A model whose member price S is 1,000,000 and cost 800,000: standard profit L10 = 200,000, floor 160,000 (80%).
const R = listPriceForMemberPrice(1_000_000);
const line = (overrides: Partial<PricingLine> = {}): PricingLine => ({
  productId: 1,
  sku: 'KIT-1',
  unitPriceVnd: R,
  quantity: 1,
  unitCostVnd: 800_000,
  ...overrides,
});

describe('stacked checkout benefits keep the shop profitable', () => {
  it('applies the member voucher, free shipping and points while profit stays above the floor', () => {
    const result = evaluateStack({
      lines: [line()],
      shippingFeeVnd: 30_000,
      voucher: { discountPercent: 10 },
      freeship: { minOrderVnd: 500_000, maxShippingVnd: 30_000 },
      pointsRequested: 1_000,
      pointsAvailable: 1_000,
    });
    expect(result.voucherDiscountVnd).toBe(R - 1_000_000);
    expect(result.shippingDiscountVnd).toBe(30_000);
    expect(result.profitVnd).toBeGreaterThanOrEqual(result.minimumProfitVnd);
    // Points fill exactly the remaining room: 200,000 − 30,000 − 160,000 = 10,000 → 20 points.
    expect(result.pointsUsed).toBe(Math.floor(10_000 / POINT_VALUE_VND));
  });

  it('refuses a voucher that would sell below the floor instead of shrinking it', () => {
    const result = evaluateStack({ lines: [line()], shippingFeeVnd: 0, voucher: { discountPercent: 25 } });
    expect(result.voucherDiscountVnd).toBe(0);
    expect(result.voucherRefusal).toBe('profit_floor');
  });

  it('refuses free shipping once the voucher used up the profit room, and explains why', () => {
    const result = evaluateStack({
      lines: [line()],
      shippingFeeVnd: 50_000,
      voucher: { discountPercent: 10, fixedAmountVnd: 150_000 },
      freeship: { minOrderVnd: 0, maxShippingVnd: 50_000 },
    });
    expect(result.voucherDiscountVnd).toBe(150_000);
    expect(result.freeshipRefusal).toBe('profit_floor');
    expect(result.shippingDiscountVnd).toBe(0);
  });

  it('never applies benefits to partner merchandise or products without a cost', () => {
    const partner = evaluateStack({
      lines: [line({ partnerId: 7 })],
      shippingFeeVnd: 30_000,
      freeship: { minOrderVnd: 0, maxShippingVnd: 30_000 },
      pointsRequested: 100,
      pointsAvailable: 100,
    });
    expect(partner.freeshipRefusal).toBe('no_eligible_items');
    expect(partner.pointsUsed).toBe(0);
    const unknown = evaluateStack({
      lines: [line({ unitCostVnd: 0 })],
      shippingFeeVnd: 30_000,
      freeship: { minOrderVnd: 0, maxShippingVnd: 30_000 },
    });
    expect(unknown.freeshipRefusal).toBe('missing_cost');
  });

  it('caps points at 10% of the merchandise and at what the customer owns', () => {
    const cheap = evaluateStack({
      lines: [line({ unitCostVnd: 100_000 })],
      shippingFeeVnd: 0,
      pointsRequested: 10_000,
      pointsAvailable: 10_000,
    });
    expect(cheap.pointsDiscountVnd).toBeLessThanOrEqual(Math.floor(R / 10));
    const few = evaluateStack({
      lines: [line({ unitCostVnd: 100_000 })],
      shippingFeeVnd: 0,
      pointsRequested: 10_000,
      pointsAvailable: 7,
    });
    expect(few.pointsUsed).toBe(7);
  });
});

describe('membership perks and engagement', () => {
  it('multiplies earned points by tier', () => {
    expect(earnedPoints(4_000_000, 'MEMBER')).toBe(100);
    expect(earnedPoints(4_000_000, 'GOLD')).toBe(130);
    expect(earnedPoints(4_000_000, 'DIAMOND')).toBe(200);
    expect(earnedPoints(39_999, 'DIAMOND')).toBe(0);
  });

  it('turns the points to the next tier into the smallest spend that earns them', () => {
    for (const tier of ['MEMBER', 'BRONZE', 'GOLD', 'EMERALD', 'DIAMOND'])
      for (const points of [1, 7, 50, 149, 1000]) {
        const spend = spendForPoints(points, tier);
        expect(earnedPoints(spend, tier)).toBeGreaterThanOrEqual(points);
        expect(earnedPoints(spend - 40_000, tier)).toBeLessThan(points);
      }
    expect(spendForPoints(150, 'MEMBER')).toBe(6_000_000);
    expect(spendForPoints(0, 'GOLD')).toBe(0);
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
