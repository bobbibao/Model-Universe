# Model Universe Purchase policy

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/purchase-policy.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

Required:

- Sell NEW and secondhand models with exact identity/version, condition, assembly status, box, instructions, decals, weapons/accessories, missing pieces, repairs/customization and actual photos.
- Order confirmation is a recorded system/shop action; collect correct customer, recipient, product, quantity, payment method and delivery information.
- Preserve the condition disclosure and price the customer accepted. An admin editing a listing later must not change past order evidence.
- Clearly recommend a continuous unboxing video. Do not invent a rule that every claim without video is automatically rejected; the source calls it supporting evidence.
- Support review of wrong item, missing promised accessories, undisclosed defects, shipping damage and significant description mismatch. Outcomes may include replacement parts, exchange, repair, partial/full refund or agreed compensation.
- A disclosed defect is not a new defect. Preserve evidence, decisions, actor and timestamps.
- Deposit cancellations follow S2; an un-deposited cancellation is allowed before shop-confirmed processing under S1. This differs from the current general `PROCESSING` cancellation behavior and needs an explicit confirmation boundary.
- Loyalty is earned on completed eligible purchases, never solely on deposit creation.

Existing return workflow is a reusable starting point, not proof that these new support outcomes already exist. The current 30-day window, manual refunds, free shipping and zero tax are legacy behavior; retain compatibility for old orders while deciding new-policy terms.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
