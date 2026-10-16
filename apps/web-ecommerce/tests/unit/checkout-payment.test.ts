import {
  depositForPercent,
  isPaymentPlan,
  minimumDepositVnd,
  transferMemo,
  upfrontDueVnd,
} from '../../src/shared/payment';

describe('checkout payment plans', () => {
  it('requires at least 10% of the total, rounded up to a whole VND', () => {
    expect(minimumDepositVnd(1280000)).toBe(128000);
    expect(minimumDepositVnd(1)).toBe(1);
    expect(minimumDepositVnd(19)).toBe(2);
    expect(minimumDepositVnd(2147483647)).toBe(214748365);
  });

  it('accepts a deposit from the minimum up to the total, or the whole total', () => {
    expect(upfrontDueVnd('full', 500000)).toBe(500000);
    expect(upfrontDueVnd('deposit', 500000)).toBe(50000);
    expect(upfrontDueVnd('deposit', 500000, 50000)).toBe(50000);
    expect(upfrontDueVnd('deposit', 500000, 500000)).toBe(500000);
    expect(upfrontDueVnd('deposit', 500000, 49999)).toBeNull();
    expect(upfrontDueVnd('deposit', 500000, 500001)).toBeNull();
    expect(upfrontDueVnd('deposit', 500000, 50000.5)).toBeNull();
    expect(upfrontDueVnd('deposit', 500000, '50000')).toBeNull();
  });

  it('computes preset deposits within the allowed range', () => {
    expect(depositForPercent(1280000, 10)).toBe(128000);
    expect(depositForPercent(1280000, 30)).toBe(384000);
    expect(depositForPercent(1280000, 50)).toBe(640000);
    expect(depositForPercent(1000, 5)).toBe(100);
    expect(depositForPercent(1000, 150)).toBe(1000);
  });

  it('recognizes the two plans and builds a matching transfer memo', () => {
    expect(isPaymentPlan('deposit')).toBe(true);
    expect(isPaymentPlan('full')).toBe(true);
    expect(isPaymentPlan('cod')).toBe(false);
    expect(isPaymentPlan(undefined)).toBe(false);
    expect(transferMemo(42)).toBe('MU42');
  });
});
