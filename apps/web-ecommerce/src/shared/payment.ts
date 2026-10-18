// Checkout payment plans (owner decisions 2026-10-11 and 2026-10-18): every new shop order is paid upfront, either in
// full or as the deposit: 10% of the merchandise, never less than the shipping fee (the shop pays the carrier even
// when a parcel is refused) nor than what the carrier cannot collect on delivery, with the balance collected on
// delivery (COD). Shared by the server (OrderService enforces it) and the client (checkout shows it). Whole VND,
// integer arithmetic only.

export const PAYMENT_PLANS = ['deposit', 'full'] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export const MIN_DEPOSIT_PERCENT = 10;

export const isPaymentPlan = (value: unknown): value is PaymentPlan =>
  typeof value === 'string' && (PAYMENT_PLANS as readonly string[]).includes(value);

// The smallest deposit for an order total: 10% rounded up to the next whole VND (ceil(total * 10 / 100)).
export const minimumDepositVnd = (totalVnd: number): number => Math.floor((totalVnd * MIN_DEPOSIT_PERCENT + 99) / 100);

// The deposit: 10% of `basisVnd` (the merchandise after the voucher), at least `floorVnd` (the shipping fee, or what the
// carrier cannot collect on delivery: total − COD limit), at most the total.
export const depositDueVnd = (totalVnd: number, basisVnd = totalVnd, floorVnd = 0): number =>
  Math.min(totalVnd, Math.max(minimumDepositVnd(basisVnd), floorVnd));

// The amount the customer must transfer before the order ships, or null when the choice is invalid. The deposit is a
// single amount (depositDueVnd); a request may omit it or must name exactly that amount.
export const upfrontDueVnd = (
  plan: PaymentPlan,
  totalVnd: number,
  depositVnd?: unknown,
  basisVnd = totalVnd,
  floorVnd = 0,
): number | null => {
  if (plan === 'full') return totalVnd;
  const deposit = depositDueVnd(totalVnd, basisVnd, floorVnd);
  if (depositVnd === undefined) return deposit;
  return depositVnd === deposit ? deposit : null;
};

// The bank transfer memo customers use, so staff can match the incoming transfer to the order.
export const transferMemo = (orderId: number): string => `MU${orderId}`;
