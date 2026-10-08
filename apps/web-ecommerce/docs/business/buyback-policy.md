# Model Universe Buyback policy

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/buyback-policy.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

Required flow: submission -> preliminary appraisal -> inbound delivery -> physical inspection -> final/revised quote -> customer acceptance -> payout -> ownership transfer -> inventory intake.

- Capture front/back/sides, fragile details, box, accessories, defects, repair/custom history, model code and exact version. Upload progress and validation must work on mobile.
- Clearly label photo-based prices as preliminary. Retain quote revisions and the evidence/reason for each revision.
- A revised quote cannot complete without the customer's recorded acceptance. A final quote is not a payment receipt.
- On disagreement, cancel and arrange return shipment with the responsibility for costs recorded under the actual agreement.
- Source allows customers to send via SHIP COD and requires inspection/final acceptance; the exact courier inspection/payment sequence is open. Do not auto-pay a preliminary quote just because an inbound parcel arrived.
- Ownership transfers only after inspection, final agreement and shop payout. Only then create/activate a stock intake, with a unique source reference so retries cannot duplicate stock.

Proposed statuses: `SUBMITTED`, `APPRAISING`, `QUOTED`, `AWAITING_ITEM`, `INSPECTING`, `AWAITING_ACCEPTANCE`, `AWAITING_PAYOUT`, `COMPLETED`, `RETURNING`, `CANCELLED`, `REJECTED`. Avoid inventing automatic valuation or market-price guarantees.

Screens: Sell to Model Universe wizard, request timeline with accept/reject quote, staff intake/inspection/offer workspace, payout confirmation and return-shipment tracking.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
