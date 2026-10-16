# Deposit orders and automatic delivery

Canonical English interpretation of the owner's "deposit purchase and automatic delivery" specification 1.0,
received 2026-10-16 ([original](source/vi/deposit-delivery-specification.md)). It extends the 2026-10-11 checkout
decision (deposit of at least 10% or full payment by verified bank transfer).

## Rules

- Deposit from 10% to 100% of the product total **after** the voucher; it is a prepayment for the order, not a
  reservation hold (no 15-day hold, no extension days). The order is confirmed only after staff verify the transfer.
- `product_total = Σ unit price × quantity − voucher`; `deposit = CEIL(product_total × percent / 100)`;
  `confirmed_paid = verified payments − refunds`; `remaining = MAX(0, product_total − confirmed_paid)`.
  The server recomputes every amount (`src/shared/payment.ts`, `src/shared/fulfillment.ts`).
- Verified top-ups are allowed before a waybill exists; the COD is computed from them (`order_prepayment.kind = topup`).
- Two ways to receive the order, chosen at checkout:
  - **SPX COD** (`SPX_COD`): `cod = remaining + shipping fee (only if the customer agreed to pay it on delivery)
    + other agreed COD fees`. Otherwise the shop pays the fee. The checkout shows an estimate; the waybill freezes the
    actual fee and COD.
  - **In-person handover** (`DIRECT_MEETING`, "GDTT"): the customer proposes a place, date and slot; it applies only
    after the shop confirms it. The balance is paid at the handover.
- Cancelling never forfeits a deposit automatically (refund path unchanged).

## SPX waybill

Pre-waybill checks (all must pass, else nothing is created): verified deposit, order still processing, recipient and
address complete, products not held back, package weight and dimensions, fee, COD ≥ 0 and ≤ `SPX_COD_LIMIT_VND`, no
other active waybill for the delivery (partial unique index `order_shipment_one_active`), unique tracking number.
Retries with the same request key return the same waybill.

Carrier modes (`SPX_MODE`):

| Mode | Behaviour |
|---|---|
| `fake` (default, development) | Simulated SPXVN tracking numbers and fees; staff simulate carrier events from the order page. Refused in production unless `SPX_ALLOW_FAKE_IN_PRODUCTION=true`. |
| `manual` | Staff create the waybill in the SPX portal and record its tracking number and fee; events come from staff or the signed webhook. |

A direct SPX API integration is not built: endpoints, COD limits and the webhook format are unverified (open
decision 10). The webhook `POST /api/shipping/spx/webhook` accepts `{event_id, tracking_number, status, reason}` signed
with HMAC-SHA256 of the raw body (`X-Spx-Signature`, secret `SPX_WEBHOOK_SECRET`); repeated events are stored once.

Statuses: `CREATED, AWAITING_PICKUP, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, DELIVERY_FAILED, RETURNING,
RETURNED, CANCELLED`, with allowed transitions in `SHIPMENT_TRANSITIONS`. Picked up → order `SHIPPED`; delivered →
order `DELIVERED` with the COD still awaiting reconciliation (`order_receipt`); a failed delivery never completes the
order and alerts the shop.

## In-person handover

`WAITING_FOR_APPOINTMENT → (CHANGE_REQUESTED) → APPOINTMENT_CONFIRMED → COMPLETED`, or `NOT_HELD` (recorded with a reason;
the order is neither completed nor cancelled automatically). Completing requires the customer's 6-digit handover code
(shown in their account), confirmation that the customer checked the items, and the verified remaining balance (cash or
transfer reference) recorded as the order's receipt. Arrival alone never completes an order. Every change is kept in
the order's meeting history.

## Notifications

| Event | Shop (Zalo / admin alert) | Customer (website + email) |
|---|---|---|
| Deposit verified, in-person | ZALO-01 | "In-person order deposit confirmed" + email |
| Deposit verified, SPX | ZALO-02 | "Upfront payment confirmed" + email |
| Waybill created | ZALO-03 | tracking number, COD + email |
| Carrier refused the waybill | ZALO-04 | none (no fake tracking number, no success email) |
| Delivery failed | ZALO-05 | website + email |
| Appointment confirmed | — | website + email |
| Appointment change requested | alert | — |
| Picked up, in transit, out for delivery, delivered, returning | — | website |

Every alert is kept in **Admin → Operational alerts**. Zalo delivery uses the Official Account API only
(`ZALO_MODE=live`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_ADMIN_USER_IDS`); with `ZALO_MODE=off` (default) the alert is recorded as
"not sent" for staff to read and forward by hand, as the specification requires. Emails go to the account's address;
without SMTP (development) they are logged. Deliveries are created inside the business transaction, sent after commit,
retried up to three times, and can be re-sent from the order page. Customer and shop messages are de-duplicated per
event.

## Open decisions (configured, not assumed)

1. Deadline to pay the deposit after ordering. 2. Preparation time. 3. Deposit refund when the customer cancels.
4. No-show policy for in-person handovers. 5. Fee for a handover at a customer-chosen place. 6. Fallback when SPX
refuses a parcel. 7. Who pays return shipping after a failed delivery. 8. Top-ups after a waybill (currently refused).
9. The official Zalo channel. 10. SPX API access and the real COD limit (`SPX_COD_LIMIT_VND`, default 20,000,000).

Staff permissions remain the single ADMIN role; separate warehouse/customer-service/cashier roles are not modelled.

Code: `FulfillmentService`, `NotificationDispatchService`, `delivery/` (SPX, Zalo, messages), models `order_shipment`,
`order_shipment_event`, `admin_alert`, `notification_delivery`; tests `tests/db/deposit-delivery.test.ts`.
