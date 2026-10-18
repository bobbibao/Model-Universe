import {
  depositDueVnd,
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

  it('accepts only the deposit itself or the whole total', () => {
    expect(upfrontDueVnd('full', 500000)).toBe(500000);
    expect(upfrontDueVnd('deposit', 500000)).toBe(50000);
    expect(upfrontDueVnd('deposit', 500000, 50000)).toBe(50000);
    expect(upfrontDueVnd('deposit', 500000, 150000)).toBeNull(); // 30% is no longer offered
    expect(upfrontDueVnd('deposit', 500000, 49999)).toBeNull();
    expect(upfrontDueVnd('deposit', 500000, 500001)).toBeNull();
    expect(upfrontDueVnd('deposit', 500000, 50000.5)).toBeNull();
    expect(upfrontDueVnd('deposit', 500000, '50000')).toBeNull();
  });

  it('never asks a deposit below the shipping fee (the floor) nor above the total', () => {
    expect(depositDueVnd(1280000)).toBe(128000);
    // 499,000 of merchandise + 17,000 shipping: 10% is 49,900, above the fee.
    expect(depositDueVnd(516000, 499000, 17000)).toBe(49900);
    // 99,000 of merchandise + 30,000 shipping: 10% would be 9,900, so the deposit is the fee.
    expect(depositDueVnd(129000, 99000, 30000)).toBe(30000);
    expect(upfrontDueVnd('deposit', 129000, undefined, 99000, 30000)).toBe(30000);
    expect(depositDueVnd(1000, 1000, 5000)).toBe(1000);
  });

  it('recognizes the two plans and builds a matching transfer memo', () => {
    expect(isPaymentPlan('deposit')).toBe(true);
    expect(isPaymentPlan('full')).toBe(true);
    expect(isPaymentPlan('cod')).toBe(false);
    expect(isPaymentPlan(undefined)).toBe(false);
    expect(transferMemo(42)).toBe('MU42');
  });
});
