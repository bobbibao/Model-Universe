# Model Universe Reservation and deposit specification

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/reservation-specification.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

### Monetary and time rules

Let `P` be the locked eligible product amount and `D` the total confirmed payment allocated to it. Unconfirmed receipts do not count. For `0.5P <= D <= P`:

```text
completedSteps = floor((20 * D - 10 * P) / P)
holdDays = 15 + completedSteps * 10
remainingAmount = P - D
baseExpiry = originalConfirmedStart + holdDays
effectiveExpiry = baseExpiry + approvedExtensionDays
```

This integer-ratio formulation implements complete 5-percentage-point increments without floating-point boundary errors. Ensure intermediate arithmetic stays within supported integer range. Reject less than 50% for activation and more than 100% allocation. Do not derive eligibility from a rounded displayed percentage.

| Confirmed percentage | Entitlement days |
|---|---:|
| 50% | 15 |
| 55% | 25 |
| 60% | 35 |
| 65% | 45 |
| 70% | 55 |
| 75% | 65 |
| 80% | 75 |
| 85% | 85 |
| 90% | 95 |
| 95% | 105 |
| 100% | 115, but the hold clock stops because the purchase is paid |

The source's unrounded formula must be interpreted with its explicit section 6 rule: 52% still earns 15 days. A top-up recalculates from the original confirmed start, not the top-up date. Preserving approved extension days during recalculation is a proposed resolution of an unstated interaction; snapshot and test it once chosen.

### State and fulfillment

Proposed storage separates reservation, payment and fulfillment state; customer labels may combine them. Do not use `COD` as both payment method and lifecycle state.

```text
PENDING_DEPOSIT -> HOLDING -> PAID -> fulfillment -> COMPLETED
                         -> DELIVERY_REQUESTED -> fulfillment -> COMPLETED
                         -> EXPIRED -> admin extension or release/cancellation
                         -> CANCELLED -> release allocation
```

- Start the clock when payment succeeds and the shop/system confirms it, not when the customer submits a request.
- Reserve the specific item/quantity atomically upon valid confirmation. Pending requests must not let multiple confirmations sell one used item. Decide separately whether a short checkout allocation is needed before payment.
- Record each initial deposit, top-up and balance payment separately. An additional deposit is a transaction event; a second long-lived reservation status is unnecessary.
- At 100%, set remaining product balance to zero, mark paid and stop expiry/reminders. Keep the item allocated to this purchase until fulfillment; do not make it available for resale.
- While holding and `now <= effectiveExpiry`, show **Request delivery / pickup** even below 100%.
- Offer supported full remainder payment, COD remainder and optional in-store payment. Product COD is `P - D`, never the original product amount. Show any separately approved shipping/service charges distinctly; do not disguise them as a second product charge.
- Shop confirmation of the request moves to `DELIVERY_REQUESTED` and stops reservation expiry. Shipping after the former expiry must not expire the order.
- Cancelling an unshipped delivery request returns an unpaid order to `HOLDING` if time remains, otherwise `EXPIRED`. A fully paid order stays outside deposit-expiry logic.
- Mark completed only after delivery/pickup and confirmed payment collection. Courier delivery alone does not prove COD reconciliation.
- Expiry condition is `now > effectiveExpiry`, payment incomplete and reservation still `HOLDING`. Expiry does not delete records or automatically release the item: admin can extend, continue holding, cancel or release, with a reason/history.
- Customer-initiated cancellation after a deposit normally forfeits it under the policy; record disposition separately from stock release. Shop-fault refunds require their own documented settlement, not deletion of payments.
- Extensions require actor, reason, old/new expiry and added days. Never edit an expiry silently.
- Notify on confirmation, top-up, three days remaining, one day remaining, expiry and payment completion. Deduplicate jobs across retries and restarts.

Screens: public reservation estimator, customer payment/expiry timeline and top-up preview, delivery request form, admin holds queue, payment verification, extensions and overdue resolution.

Acceptance: preserve S2's 15 source tests and add boundary/concurrency cases: 49.99%, 50%, 52%, 55%, 70%, 95%, 100%, overpayment, top-up from original start, duplicate confirmation, simultaneous last-unit purchase, manual extension plus top-up, expiry exactly at the boundary, cancelled delivery request, and stale/failed notification job. Verify 2,000,000 VND less 1,000,000 deposit yields 1,000,000 COD; 3,000,000 less 2,100,000 yields 900,000 COD.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
