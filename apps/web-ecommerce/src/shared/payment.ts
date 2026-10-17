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

// A preset percentage of the merchandise (`basisVnd`, default the total), rounded up, never below the minimum nor above
// the total (which may also include the shipping fee).
export const depositForPercent = (totalVnd: number, percent: number, basisVnd = totalVnd, floorVnd = 0): number =>
  Math.min(totalVnd, Math.max(minimumDepositVnd(basisVnd), floorVnd, Math.floor((basisVnd * percent + 99) / 100)));

// The amount the customer must transfer before the order ships, or null when the choice is invalid. A deposit without
// an amount is the minimum (10%).
// The minimum is 10% of `basisVnd`: the merchandise after the voucher (the shipping fee is not a deposit basis).
// `floorVnd`: a higher minimum when the carrier cannot collect more than a limit on delivery (total − COD limit).
export const upfrontDueVnd = (
  plan: PaymentPlan,
  totalVnd: number,
  depositVnd?: unknown,
  basisVnd = totalVnd,
  floorVnd = 0,
): number | null => {
  if (plan === 'full') return totalVnd;
  const minimum = Math.min(totalVnd, Math.max(minimumDepositVnd(basisVnd), floorVnd));
  if (depositVnd === undefined) return minimum;
  if (typeof depositVnd !== 'number' || !Number.isSafeInteger(depositVnd)) return null;
  return depositVnd >= minimum && depositVnd <= totalVnd ? depositVnd : null;
};

// The bank transfer memo customers use, so staff can match the incoming transfer to the order.
export const transferMemo = (orderId: number): string => `MU${orderId}`;
