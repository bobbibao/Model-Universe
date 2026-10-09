import CouponModel from '../../src/core/server/database/client/models/Coupon.Model';
import CouponService, { assertCouponUsable, couponDiscount } from '../../src/core/server/services/CouponService';

const DAY_MS = 24 * 60 * 60 * 1000;
const coupon = (overrides: Partial<CouponModel> = {}) =>
  ({
    code: 'DON1TRIEU',
    title: 'Ưu đãi đơn lớn',
    discountPercent: 8,
    usageLimit: null,
    usageCount: 0,
    startDate: new Date(Date.now() - DAY_MS),
    expirationDate: new Date(Date.now() + DAY_MS),
    isActive: true,
    minOrderVnd: 1_000_000,
    ...overrides,
  }) as CouponModel;

describe('coupon minimum order', () => {
  it('keeps partner proceeds outside shop promotions, including sale-price and fixed member rewards', () => {
    const lines = [{listPrice:100000,salePrice:100000,quantity:1,partnerId:null},{listPrice:900000,salePrice:600000,quantity:2,partnerId:12}];
    expect(couponDiscount(coupon({discountPercent:10}),lines)).toBe(10000);
    expect(couponDiscount(coupon({source:'loyalty',fixedAmountVnd:30000}),lines)).toBe(30000);
    expect(couponDiscount(coupon({source:'agent',discountPercent:10}),lines)).toBe(10000);
    expect(couponDiscount(coupon({discountPercent:10}),lines.slice(1))).toBe(0);
  });

  it('does not consume a voucher when no shop-owned merchandise qualifies', () => {
    expect(()=>assertCouponUsable(coupon({minOrderVnd:0}),0)).toThrow('eligible shop-owned merchandise');
    expect(()=>assertCouponUsable(coupon(),100000)).toThrow();
  });
  it('refuses an order below the minimum, naming it in VND', () => {
    expect(() => assertCouponUsable(coupon(), 999_999)).toThrow(/từ 1\.000\.000\s₫/);
  });

  it('accepts an order at or above the minimum, and any order without one', () => {
    expect(assertCouponUsable(coupon(), 1_000_000).code).toBe('DON1TRIEU');
    expect(assertCouponUsable(coupon({ minOrderVnd: 0 }), 1).code).toBe('DON1TRIEU');
  });

  it('checks the cart subtotal before checkout', async () => {
    const findOne = jest.spyOn(CouponModel, 'findOne').mockResolvedValue(coupon());
    const service = new CouponService();
    await expect(service.validateForCheckout('don1trieu', '1500000')).resolves.toMatchObject({ minOrderVnd: 1_000_000 });
    await expect(service.validateForCheckout('don1trieu', '500000')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.validateForCheckout('don1trieu', undefined)).rejects.toMatchObject({ statusCode: 400 });
    findOne.mockRestore();
  });
});
