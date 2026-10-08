export const RESERVATION_STATUSES = ['awaiting_payment', 'holding', 'fully_paid', 'delivery_requested', 'fulfilling', 'completed', 'expired', 'cancelled'] as const;
export type ReservationStatus = typeof RESERVATION_STATUSES[number];
export const DAY_MS = 86_400_000;

// All amounts are integer VND. Partial steps do not earn extra days.
export function reservationDays(totalVnd: number, paidVnd: number): number {
  if (!Number.isSafeInteger(totalVnd) || totalVnd <= 0 || !Number.isSafeInteger(paidVnd) || paidVnd < Math.ceil(totalVnd / 2) || paidVnd > totalVnd) {
    throw new RangeError('A confirmed deposit must cover 50% to 100% of the total.');
  }
  const steps = Number((BigInt(20) * BigInt(paidVnd) - BigInt(10) * BigInt(totalVnd)) / BigInt(totalVnd));
  return 15 + 10 * steps;
}

export function reservationDeadline(startedAt: Date, totalVnd: number, paidVnd: number, extensionDays = 0): Date {
  if (!Number.isInteger(extensionDays) || extensionDays < 0) throw new RangeError('Invalid approved extension.');
  return new Date(startedAt.getTime() + (reservationDays(totalVnd, paidVnd) + extensionDays) * DAY_MS);
}
