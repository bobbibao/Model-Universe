# Model Universe Loyalty specification

Canonical English operational interpretation, derived from the supplied policy/specification. Original evidence: [archived source](source/vi/loyalty-specification.md). Disputed values are preserved in the [decision register](../model-universe/business-requirements.md#9-decision-register); this document does not approve them.

### Earning and tiers

Owner rules v5.0–v6.2 of 2026-10-20 are the priority text ([unified rules](source/vi/unified-business-rules-v5.md),
[folder addenda](source/vi/drive-folder-addenda-2026-10-20.md)); the full formulas and checks are in
[pricing-voucher-specification](pricing-voucher-specification.md).

`earnedPoints = FLOOR(eligible product payment after every discount / 40,000)`, credited **once**, when the order is
`COMPLETED` (paid, delivered, no open dispute) **and** the Admin-configured return-control period has passed. Not on a
deposit, hold or instalment before completion; not on shipping, COD fees, service fees, ineligible tax, pawn interest,
forfeited deposits, the part covered by a voucher, refunds, cancelled orders, money the shop pays for a buy-in or trade,
or seller/partner payments. A trade earns points only on the new purchase money the customer really pays. Old
transactions are reconciled with evidence, once each, never back-dated for buy-in or refunded money.

| Tier | Qualifying lifetime points | Rank benefit (on top of **one** main voucher) | Cap |
|---|---:|---:|---:|
| MEMBER | 0 | none | – |
| BRONZE (Đồng) | 150 | +0.5% | 15,000 |
| SILVER (Bạc) | 250 | +0.75% | 25,000 |
| GOLD (Vàng) | 500 | +1% | 40,000 |
| PLATINUM (Bạch Kim) | 1,500 | +1.25% | 50,000 |
| EMERALD (Lục Bảo) | 3,500 | +1.5% | 65,000 |
| DIAMOND (Kim Cương) | 10,000 | +2% | 100,000 |

The rank benefit is **not** an independent discount any more (the 2 / 4 / 6 / 10 / 12 / 15% table is retired for new
orders). It is added to one valid main voucher only when two profit checks pass (voucher alone ≥ 80%, voucher plus rank ≥
75% of the standard profit, plus the absolute and margin floors); otherwise the voucher applies alone and no promise of a
rank benefit is made. The tier follows **lifetime points, not the spendable balance**: spending points never lowers it.

Keep five balances apart: lifetime (rank) points, available points, pending points, reserved points, and debit/reversal.
A refund writes a `REVERSAL` entry and never deletes history; a negative obligation is carried forward as debt and blocks
redemption until it balances. Each earn or reversal references its source event once; completion replay, webhooks, deposits
and redelivered COD must not issue more points. A refund after points are spent leaves the available balance at zero and
records the debt, settled by later earning; partial refunds use a deterministic cumulative method so split refunds cannot
over- or under-reverse floor-rounded earnings. Points have no cash value.

**Implementation (2026-10-23).** Checkout applies the rank benefit above on top of one main voucher and credits one point
per whole 40,000 VND with no multiplier (`src/shared/voucher-stack.ts`, `LoyaltyService.reconcileOrder`). Orders first
rewarded under the earlier multiplier keep it for refund recalculations. Still open: the return-control period before
points are credited (V4 in [pricing-voucher-specification](pricing-voucher-specification.md)); see
[promotions-specification](promotions-specification.md) for the checkout.

### Rewards

The tables below are **configuration templates**, not applicable to every SKU: each needs SKU profit checks, caps, budget and validity before it is offered (v5.0 §5). Activation depends on D2.

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
- One main voucher per order; a point-redemption voucher is a main voucher and takes that slot (it never adds the 10% member code). Like any main voucher, an issued point voucher may be topped up with **one** rank benefit if it passes the 80% check alone and the 75% check with the rank (v6.2; the earlier "no rank on a point voucher" wording is superseded); the conditions are shown to the customer before use. Points are deducted atomically when the voucher is issued (locked while issuing, released if issuing fails) and are not deducted again on use. If a point voucher is worse for the customer than the free 10% code, do not suggest spending points; tell the customer the conditions, expiry and cancellation rights. Gifts are valued at real cost plus shipping and packing. See [pricing-voucher-specification](pricing-voucher-specification.md).
- Reserve a voucher when an order uses it to prevent concurrent reuse, then finalize on completion as the source requests. Define release/restoration on cancellation without confusing cancellation of an order with cancellation of a redeemed reward.
- Validate owner, status, start/end times, minimum spend, eligible products and cap on the backend.
- Point awards/adjustments and reward policy changes are auditable; never directly edit balances without a ledger record. Reward snapshots preserve old issued benefits after settings change.
- Historical claims require evidence, transaction date/value/reference, reviewer and decision. Match source transaction identity across claims, not only upload hash: recropping the same invoice must not allow another award. Existing recorded purchases cannot be claimed again.
- Trade and buy-in value earns **nothing**: neither the shop's buy-in valuation, the market price nor the customer's original purchase price. Only the money the customer really pays for new goods in a completed purchase earns points (a 3,000,000 trade-in earns 0; an 800,000 top-up for another model earns 20 once completed). Historical trade claims need evidence of that new-purchase payment.
- Bonus/referral earning needs explicit campaign parameters; the source's sample referral values and monthly limit are optional examples, not automatic defaults.

Screens: member overview with tier progress, available points and debt explanation; reward catalog; wallet of issued vouchers; points history; historical-proof submission; admin claims/rewards/adjustments.

Acceptance includes all ten S7 tests (TEST 02 expects 22 points for 1,000,000 less a 100,000 voucher; tier names in S7 TEST 03–05 still hold, but its rank percentages are the retired ones), plus simultaneous redemption, reused invoice with different image, refunded purchase after redemption, partial refund sequencing, eligibility exclusions and owned-voucher isolation.

## Shared safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.
