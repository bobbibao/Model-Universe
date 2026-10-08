# Model Universe Partner marketplace policy

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/partner-marketplace-policy.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

Required:

- Individuals, professional sellers and shops can apply with contact, address, payout details, shop/social information and verification evidence. Application review precedes selling; listing moderation precedes publication.
- Partners own their inventory and dashboard. Enforce tenant/ownership checks in API services, not just page routes. An existing supplier record is not automatically a marketplace seller account.
- Listings disclose exact identity/version, NEW/2ND, quantity, actual condition, box/accessories/defects and dispatch timing. Actual photos are mandatory for secondhand listings.
- Support draft/pending/rejected/published/hidden moderation separately from available/reserved/sold/out-of-stock inventory state.
- For listings using the guarantee scheme, record a **10% product-value guarantee**, independently from the platform fee. Do not label it revenue when received.
- Guarantee returns in full on successful sale or compliant withdrawal/termination with no outstanding disputes/obligations. Any deduction requires an evidenced reason and history.
- Source proposes 10% platform commission on net product value, excluding separately paid shipping; alternative partner tiers propose 12%, 10%, 8%, 6–7%, 5%. The actual schedule is D3, not a randomly selected default.
- Record gross product proceeds, discount funding, fee basis, commission, refunds, withheld amount and seller net separately. Returning the seller's own guarantee is not additional sales proceeds.
- Customer payment -> verified receipt -> seller dispatch -> delivery -> completed transaction -> settlement eligibility. Open disputes freeze the affected settlement until resolved.
- Add seller fulfillment records so a multi-seller basket can produce seller-specific shipment, cancellation, return and settlement while retaining one buyer-facing order. Decide shipping allocation and settlement delay before activation.
- Seller ratings require completed purchases. Record description accuracy, packaging, delivery and communication. Keep review provenance; no generated trust history in production.
- Trust considers verification, successful orders, completion/cancellation/complaint rates and violations. Source ranges are 90–100, 80–89, 70–79, 50–69 and below 50; scoring weights/defaults/automatic sanctions are unspecified and must not be invented. Start with factual badges plus reviewed restrictions until D3 is complete.
- Apply configurable listing/value/order limits to new sellers. Staff can warn, restrict, suspend and remove listings with an audit trail; suspension must not silently discard existing fulfillment/refund obligations.
- Capture complaints, both parties' evidence, findings, refund/guarantee decisions and settlement effects in one traceable case.

Screens: partner application/status, seller storefront, seller inventory/forms, fulfillment queue, statements/guarantees/payouts, trust panel, dispute center, admin moderation/verification/settlement queues.

Acceptance: seller isolation; hidden/unapproved listings absent from search; unique preowned item cannot sell twice; fee snapshot survives tier change; shipping excluded from commission; dispute freezes payout; partial return adjusts only correct seller; duplicate payout/guarantee refund rejected; suspension preserves existing obligations.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
