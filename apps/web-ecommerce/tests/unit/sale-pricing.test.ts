import { catalogFormula, safeSalePercent, weeklySalePercent, vietnamWeekStart } from '../../src/shared/sale-pricing';
import { memberPrice } from '../../src/shared/pricing';
import { couponDiscount } from '../../src/core/server/services/CouponService';
import { applyDiscount } from '../../src/core/server/services/ProductDiscountService';

describe('shop sale and catalog pricing', () => {
  it('calculates B and R from the spec example, with ordinary issue deductions', () => {
    const result = catalogFormula(1_100_000, 2);
    expect(result.buybackPriceVnd).toBe(750_000); // 1,100,000 − 250,000 − 2 × 50,000
    expect(result.listPriceVnd).toBe(1_222_222);
    expect(memberPrice(result.listPriceVnd)).toBe(1_100_000);
  });
  it.each([500_000, 500_001, 1_000_000, 1_000_001, 1_500_000, 2_000_000, 3_000_000, 5_000_000])(
    'round-trips the member price at %i',
    (s) => {
      expect(memberPrice(catalogFormula(s, 0).listPriceVnd)).toBe(s);
    },
  );
  it('does not invent formulas for appraisal-only goods or non-positive offers', () => {
    expect(() => catalogFormula(5_000_001, 0)).toThrow();
    expect(() => catalogFormula(100_000, 1)).toThrow();
    expect(() => catalogFormula(900_000, -1)).toThrow();
  });
  it('selects deeper weekly discounts only when the original profit floor allows them', () => {
    expect(weeklySalePercent(1_000_000, 100_000, 60, 25)).toBe(15);
    expect(weeklySalePercent(1_000_000, 100_000, 90, 25)).toBe(20);
    expect(weeklySalePercent(1_000_000, 100_000, 120, 25)).toBe(25);
    expect(weeklySalePercent(1_000_000, 850_000, 120, 25)).toBe(11);
    expect(weeklySalePercent(1_000_000, 0, 120, 25)).toBe(0);
    expect(safeSalePercent(1_000_000, 950_000, 10)).toBe(false);
  });
  it('uses the spec half-up discount rounding, including half-VND boundaries', () => {
    expect(applyDiscount(105, 10)).toBe(94);
    expect(applyDiscount(105, 10)).toBe(memberPrice(105));
  });
  it('finds the Monday boundary in Vietnam rather than UTC', () => {
    expect(vietnamWeekStart(new Date('2026-10-18T18:00:00Z')).toISOString()).toBe('2026-10-18T17:00:00.000Z');
    expect(vietnamWeekStart(new Date('2026-10-18T16:59:00Z')).toISOString()).toBe('2026-10-11T17:00:00.000Z');
  });
  it('allows one member voucher on a sale only if the combined original profit floor holds', () => {
    const member = { source: 'member', kind: 'member', discountPercent: 10, profitGuard: true } as const;
    const line = {
      productId: 1,
      sku: 'KIT',
      listPrice: 1_000_000,
      salePrice: 850_000,
      quantity: 1,
      costVnd: 100_000,
      managedSale: true,
    };
    expect(couponDiscount(member, [line])).toBe(85_000);
    expect(() => couponDiscount(member, [{ ...line, salePrice: 750_000 }])).toThrow();
    expect(() => couponDiscount({ source: 'admin', discountPercent: 25 }, [line])).toThrow();
  });
});
