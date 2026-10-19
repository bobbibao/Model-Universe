// Order cancellation (owner decision 2026-10-18): every cancellation records why and by whom. Shared by the server
// (OrderService enforces the rules) and the client (the reason pickers).
//
// Customer, while the order is PROCESSING:
//   - nothing paid and no waybill yet: cancelled at once;
//   - money already received, or a waybill created but not picked up: a cancellation request staff approve (the waybill
//     is cancelled with the carrier, then the payment is refunded) or reject;
//   - picked up or later: not possible; the customer refuses the parcel on delivery or asks for a return afterwards.
// Staff: any PROCESSING order with a staff reason; a waybill still waiting for pickup is cancelled with the carrier first;
// once picked up it cannot be cancelled.

export const CUSTOMER_CANCEL_REASONS = [
  'changed_mind',
  'wrong_address',
  'wrong_item',
  'found_better_price',
  'delivery_too_slow',
  'duplicate_order',
  'other',
] as const;
export type CustomerCancelReason = (typeof CUSTOMER_CANCEL_REASONS)[number];

export const STAFF_CANCEL_REASONS = [
  'customer_request',
  'out_of_stock',
  'customer_unreachable',
  'payment_not_received',
  'address_unserviceable',
  'suspected_fraud',
  'other',
] as const;
export type StaffCancelReason = (typeof STAFF_CANCEL_REASONS)[number];

// Cancellations the system makes on its own: an unpaid order past its payment deadline, or a customer's request staff
// did not answer within CANCEL_REQUEST_HOURS (approved automatically, as Shopee does).
export const SYSTEM_CANCEL_REASONS = ['payment_timeout', 'customer_request'] as const;
export type SystemCancelReason = (typeof SYSTEM_CANCEL_REASONS)[number];

export type CancelReason = CustomerCancelReason | StaffCancelReason | SystemCancelReason;

// How long staff have to answer a cancellation request before it is approved automatically.
export const CANCEL_REQUEST_HOURS = 24;

// "other" needs a note that explains it; any note is at most this long.
export const CANCEL_NOTE_MIN = 10;
export const CANCEL_NOTE_MAX = 500;

export interface CancelRequest {
  reason: CustomerCancelReason;
  note: string | null;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedAt?: string | null;
  decidedByUserId?: number | null;
  decisionNote?: string | null;
}
