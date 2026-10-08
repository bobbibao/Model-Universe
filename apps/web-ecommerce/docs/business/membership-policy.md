# Model Universe Membership policy

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/membership-policy.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

### Earning and tiers

`earnedPoints = floor(eligibleNetProductAmount / 40000)` after `COMPLETED`: paid, delivered and no open dispute. Exclude shipping, COD fees, service fees, pawn interest, forfeited deposits, discounts, refunds and incomplete payments.

| Tier | Qualifying lifetime points | Listed member discount |
|---|---:|---:|
| MEMBER | 0 | 0% |
| BRONZE | 150 | 2% |
| SILVER | 250 | 4% |
| GOLD | 500 | 6% |
| PLATINUM | 1,500 | 10% |
| EMERALD | 3,500 | 12% |
| DIAMOND | 10,000 | 15% |

Separate qualifying lifetime points, available balance, used points and point debt. Redeeming points reduces availability, never qualifying lifetime points or tier. Invalidated purchases must be reversed with ledger entries; refund effects on qualifying tier totals require decision D7.

Each earn/reversal references its source event once. Completion replay must not issue more points. A refund after points are spent leaves available points at zero and records debt settled by future earning; do not erase the deficit. Partial refund calculation needs a deterministic cumulative method so split refunds cannot over/under-reverse floor-rounded earnings.

### Rewards

Proposed default is the table shared by S6 and S7 sections 10–11, rather than earlier/later illustrative alternatives. Activation depends on D2.

| Points | Fixed voucher VND | Minimum order VND |
|---:|---:|---:|
| 60 | 50,000 | 500,000 |
| 110 | 100,000 | 1,000,000 |
| 160 | 150,000 | 1,500,000 |
| 210 | 200,000 | 2,000,000 |
| 500 | 500,000 | 5,000,000 |
| 900 | 1,000,000 | 10,000,000 |

| Points | Percentage voucher | Maximum discount VND |
|---:|---:|---:|
| 50 | 2% | 100,000 |
| 100 | 3% | 150,000 |
| 200 | 5% | 250,000 |
| 350 | 7% | 300,000 |
| 500 | 10% | 500,000 |
| 800 | 12% | 700,000 |

- Support finite-stock gift rewards, actual SKU inventory and fulfillment; illustrative gift values are not real stock.
- Redemption atomically deducts points, records history, reserves reward quantity and issues the customer-owned voucher/gift claim. Failures leave no partial deduction.
- Default one points voucher and one primary benefit per order. Decide precedence among sale price, tier benefit, normal coupon and reward voucher, including existing agent margin/discount constraints, before live rollout.
- Reserve a voucher when an order uses it to prevent concurrent reuse, then finalize on completion as the source requests. Define release/restoration on cancellation without confusing cancellation of an order with cancellation of a redeemed reward.
- Validate owner, status, start/end times, minimum spend, eligible products and cap on the backend.
- Point awards/adjustments and reward policy changes are auditable; never directly edit balances without a ledger record. Reward snapshots preserve old issued benefits after settings change.
- Historical claims require evidence, transaction date/value/reference, reviewer and decision. Match source transaction identity across claims, not only upload hash: recropping the same invoice must not allow another award. Existing recorded purchases cannot be claimed again.
- Historical trade points use the shop-recognized transaction value, not a customer's claimed original purchase price.
- Bonus/referral earning needs explicit campaign parameters; the source's sample referral values and monthly limit are optional examples, not automatic defaults.

Screens: member overview with tier progress, available points and debt explanation; reward catalog; wallet of issued vouchers; points history; historical-proof submission; admin claims/rewards/adjustments.

Acceptance includes all ten S7 tests, plus simultaneous redemption, reused invoice with different image, refunded purchase after redemption, partial refund sequencing, eligibility exclusions and owned-voucher isolation.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
