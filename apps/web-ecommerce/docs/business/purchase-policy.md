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

## Prices, vouchers and points (owner rules v5.0 – v6.2, 2026-10-20)

Source: section C of the [folder addenda](source/vi/drive-folder-addenda-2026-10-20.md); the formulas are in
[pricing-voucher-specification](pricing-voucher-specification.md). Where the v5.0 paragraph ("one money-off benefit per
order; the rank benefit never adds to the 10% code") and the appended v6.2 checkout rule differ, v6.2 wins:

- List prices and benefits are published plainly; no invented struck-through price.
- One main voucher per order (member 10%, event, fixed or point voucher), plus at most one rank benefit when the voucher
  alone keeps ≥ 80% and the pair keeps ≥ 75% of the standard profit, with the 50,000 VND and 5% floors. Never two main
  vouchers or two rank benefits.
- Every voucher condition and SKU limit is shown before the customer confirms.
- A deposit is a percentage of the goods price after the locked benefits; shipping is announced separately.
- Points are `FLOOR(goods money really paid after benefits / 40,000)`, only when the order is complete, never at order,
  deposit or delivered-but-not-completed; refunds and cancellations adjust the points of that transaction.
- Partner goods get no shop voucher without funding and an approved SKU; missing cost, real list price or voucher
  conditions block automatic vouchers. Confirmed orders keep their price, codes and rule.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
