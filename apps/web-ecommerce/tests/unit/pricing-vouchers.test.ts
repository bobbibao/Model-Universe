import {
  bestVoucher,
  evaluateVoucher,
  listPriceForMemberPrice,
  memberPrice,
  voucherLimits,
  type PricingLine,
} from '../../src/shared/pricing';
import { codAmountVnd, checkoutShippingEstimateVnd, remainingProductVnd } from '../../src/shared/fulfillment';
import { minimumDepositVnd } from '../../src/shared/payment';

// Pricing and voucher specification 4.0, chapter XVI, and the deposit/delivery COD formula.
const line = (productId: number, unitPriceVnd: number, unitCostVnd: number): PricingLine => ({
  productId,
  sku: `SKU-${productId}`,
  unitPriceVnd,
  quantity: 1,
  unitCostVnd,
});

describe('member price and list price', () => {
  it('TC03: S = 1,050,000 gives R ≈ 1,166,667 and back exactly', () => {
    expect(listPriceForMemberPrice(1_050_000)).toBe(1_166_667);
    expect(memberPrice(1_166_667)).toBe(1_050_000);
    expect(memberPrice(listPriceForMemberPrice(1_100_000))).toBe(1_100_000);
  });
  it('TC04: 10% off 1,155,000 is 1,039,500', () => {
    expect(memberPrice(1_155_000)).toBe(1_039_500);
  });
});

describe('profit guard', () => {
  it('TC05: S 1,050,000 with 150,000 profit has a lowest payment of 1,020,000', () => {
    expect(voucherLimits({ targetMemberVnd: 1_050_000, costVnd: 900_000, basket: false }).minimumPaymentVnd).toBe(1_020_000);
  });

  it('chapter V table: the 500,000 VND tier allows 12% but not 14%', () => {
    const limits = voucherLimits({ targetMemberVnd: 500_000, costVnd: 400_000, basket: false });
    expect(limits.listPriceVnd).toBe(555_556);
    expect(limits.minimumPaymentVnd).toBe(480_000);
    expect(limits.percents.find((row) => row.percent === 12)?.allowed).toBe(true);
    expect(limits.percents.find((row) => row.percent === 14)?.allowed).toBe(false);
  });

  it('TC06/TC07: a single product may lose at most 20% of its standard profit', () => {
    // R = 1,222,222, C = 900,000, L10 = 200,000. 12% loses 11%; 16% loses more than 20%.
    const product = [line(1, 1_222_222, 900_000)];
    expect(evaluateVoucher({ discountPercent: 12, profitGuard: true }, product).eligible).toBe(true);
    expect(evaluateVoucher({ discountPercent: 16, profitGuard: true }, product)).toMatchObject({ eligible: false, refusal: 'profit_floor' });
  });

  it('TC08/TC09: a basket of two products may lose up to 22%', () => {
    // A: S 1,100,000 / C 900,000; B: S 750,000 / C 600,000 → max ≈ 13.75%.
    const basket = [line(1, listPriceForMemberPrice(1_100_000), 900_000), line(2, listPriceForMemberPrice(750_000), 600_000)];
    expect(evaluateVoucher({ discountPercent: 12, profitGuard: true }, basket).eligible).toBe(true);
    expect(evaluateVoucher({ discountPercent: 14, profitGuard: true }, basket).eligible).toBe(false);
    expect(evaluateVoucher({ discountPercent: 12, profitGuard: true }, basket).maximumLossBasisPoints).toBe(2200);
  });

  it('chapter VIII: a high-margin add-on unlocks a 16% voucher', () => {
    const basket = [line(1, listPriceForMemberPrice(1_100_000), 900_000), line(2, listPriceForMemberPrice(600_000), 200_000)];
    const result = evaluateVoucher({ discountPercent: 16, profitGuard: true }, basket);
    expect(result.eligible).toBe(true);
    expect(result.actualLossBasisPoints).toBeLessThanOrEqual(2200);
  });

  it('TC10: 25% capped at 160,000 takes exactly 160,000 and stays within 20%', () => {
    const result = evaluateVoucher({ discountPercent: 25, maxDiscountVnd: 160_000, profitGuard: true }, [line(1, 1_222_222, 900_000)]);
    expect(result).toMatchObject({ eligible: true, discountVnd: 160_000, customerPaysVnd: 1_062_222, actualProfitVnd: 162_222 });
    expect(result.actualLossBasisPoints).toBe(1889);
  });

  it('TC11: a capped 25% voucher worse than the 10% code is not chosen', () => {
    const lines = [line(1, 2_222_222, 1_700_000)];
    const best = bestVoucher(
      [
        { voucher: 'CAPPED25', terms: { discountPercent: 25, maxDiscountVnd: 100_000, profitGuard: true } },
        { voucher: 'MEMBER10', terms: { discountPercent: 10, profitGuard: true } },
      ],
      lines,
    );
    expect(best?.voucher).toBe('MEMBER10');
  });

  it('TC14: missing cost blocks a profit-guarded voucher', () => {
    expect(evaluateVoucher({ discountPercent: 10, profitGuard: true }, [line(1, 1_000_000, 0)]).refusal).toBe('missing_cost');
  });

  it('honours minimum order, SKU lists and cart type', () => {
    const lines = [line(1, 400_000, 200_000)];
    expect(evaluateVoucher({ discountPercent: 8, minOrderVnd: 500_000 }, lines).refusal).toBe('minimum_order');
    expect(evaluateVoucher({ discountPercent: 8, eligibleSkus: ['SKU-9'] }, lines).refusal).toBe('no_eligible_items');
    expect(evaluateVoucher({ discountPercent: 8, cartType: 'basket' }, lines).refusal).toBe('cart_type');
  });
});

describe('deposit and COD', () => {
  it('TC18 (vouchers): the 10% deposit is computed after the voucher', () => {
    expect(minimumDepositVnd(1_100_000)).toBe(110_000);
  });
  it('chapter IV example: 2,500,000 with a 10% deposit and a 35,000 fee collects 2,285,000', () => {
    expect(codAmountVnd(2_500_000, 250_000, 35_000, 'cod')).toBe(2_285_000);
    expect(codAmountVnd(2_500_000, 250_000, 35_000, 'shop')).toBe(2_250_000);
    expect(remainingProductVnd(2_000_000, 2_000_000)).toBe(0);
  });
  it('estimates shipping from the billable weight', () => {
    expect(checkoutShippingEstimateVnd(1)).toBeGreaterThan(22_000);
  });
});
