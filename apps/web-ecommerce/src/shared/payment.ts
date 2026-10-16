// Checkout payment plans (owner decision 2026-10-11): every new shop order is paid upfront by bank transfer, either in
// full or as a deposit of at least 10% of the order total with the balance collected on delivery (COD). Shared by the
// server (OrderService enforces it) and the client (checkout shows it). Whole VND, integer arithmetic only.

export const PAYMENT_PLANS = ['deposit', 'full'] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export const MIN_DEPOSIT_PERCENT = 10;
// Quick choices offered at checkout; any whole-VND amount from the minimum up to the total is accepted.
export const DEPOSIT_PRESETS = [10, 30, 50] as const;

export const isPaymentPlan = (value: unknown): value is PaymentPlan =>
  typeof value === 'string' && (PAYMENT_PLANS as readonly string[]).includes(value);

// The smallest deposit for an order total: 10% rounded up to the next whole VND (ceil(total * 10 / 100)).
export const minimumDepositVnd = (totalVnd: number): number => Math.floor((totalVnd * MIN_DEPOSIT_PERCENT + 99) / 100);

// A preset percentage of the total, rounded up, never below the minimum nor above the total.
export const depositForPercent = (totalVnd: number, percent: number): number =>
  Math.min(totalVnd, Math.max(minimumDepositVnd(totalVnd), Math.floor((totalVnd * percent + 99) / 100)));

// The amount the customer must transfer before the order ships, or null when the choice is invalid. A deposit without
// an amount is the minimum (10%).
export const upfrontDueVnd = (plan: PaymentPlan, totalVnd: number, depositVnd?: unknown): number | null => {
  if (plan === 'full') return totalVnd;
  if (depositVnd === undefined) return minimumDepositVnd(totalVnd);
  if (typeof depositVnd !== 'number' || !Number.isSafeInteger(depositVnd)) return null;
  return depositVnd >= minimumDepositVnd(totalVnd) && depositVnd <= totalVnd ? depositVnd : null;
};

// The bank transfer memo customers use, so staff can match the incoming transfer to the order.
export const transferMemo = (orderId: number): string => `MU${orderId}`;
