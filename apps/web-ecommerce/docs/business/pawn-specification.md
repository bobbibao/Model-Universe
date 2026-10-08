# Model Universe Pawn specification

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/pawn-specification.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

Required flow: request -> appraisal -> customer agreement -> bilateral contract confirmation -> asset handover -> disbursement -> active contract -> redemption/extension or overdue contractual resolution.

- Principal must be 50–80% of appraised asset value. Snapshot asset condition/photos, appraisal, selected ratio, principal, dates and contract terms.
- Customer sees interest rate, expected interest, due date, redemption/extension and disposal conditions before confirming.
- S5 specifies simple interest at **0.03% per day**, with the worked example 1,400,000 principal -> 420/day -> 12,600 over 30 days. S4 prose agrees, but its formula says **0.3%**. Decision D1 remains open until the owner confirms.
- After D1, use `interest = min(principal, principal * approvedDailyRate * chargeableDays)` with explicit rounding/day-count policy. Interest starts at actual disbursement. Early redemption charges actual eligible days, not the entire agreed term.
- The source policy ties accrual to repayment plus physical handback, while the specification describes repayment. D6 requires an explicit `verified_repayment` or `asset_handback` choice before any contract quote. Disposal is not an approved interest-stop event.
- Post-disposal debt, sale-proceeds allocation and any surplus owed to the customer are unresolved D6 decisions; neither disposal nor inventory intake forgives a debt or records sale proceeds.
- Reaching the interest cap stops accrual; it does not transfer asset ownership or authorize resale.
- Store custody separately from sellable stock. No buy/sell/agent action may use active pledged assets as available inventory.
- Extensions need approval and recorded old/new due date. Overdue status sends notification; disposal requires contract eligibility plus recorded authorized decision.
- Redemption requires confirmed payment and recorded asset handback. Keep payment completion and handback independently visible so a paid-but-not-returned item is not lost operationally.
- Only permitted disposal can create a stock intake/listing, once, preserving custody and contract references.
- Future loyalty/rate benefits are mentioned as future possibilities, not active overrides of the principal/rate rules.

Screens: pawn request wizard, quote/terms confirmation, private contract summary, live redemption estimate, extension request, staff appraisal/custody/disbursement/redemption/disposal queues. Contract attachments and identity evidence are private; do not reuse public product uploads without access-control changes.

Acceptance includes 50% and 80% boundaries, before-disbursement zero accrual, approved day-count/rounding, cap at principal, early redemption, extension, duplicate payment, overdue without disposal eligibility, authorized intake exactly once, and another customer's inability to access contract files.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
