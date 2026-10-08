# Model Universe business requirements and decisions

Companion to the [refactor plan](./refactor-plan.md). These requirements come from the owner's eight documents. `Required` means source-backed. `Proposed` means an implementation choice to review. `Open` means no authoritative answer was found; do not silently turn it into live financial policy.

## 1. Source register

Original Vietnamese evidence is preserved byte-for-byte under English archive filenames. See [source register](../business/source-register.json) for original paths and SHA-256 checksums; canonical operational documents are in `docs/business/`.

| ID | Supplied source | Proposed canonical English filename |
|---|---|---|
| S1 | [Purchase policy](<../business/source/vi/purchase-policy.md>) | `purchase-policy.md` |
| S2 | [Reservation and deposit specification](<../business/source/vi/reservation-specification.md>) | `reservation-specification.md` |
| S3 | [Buyback policy](<../business/source/vi/buyback-policy.md>) | `buyback-policy.md` |
| S4 | [Pawn policy](<../business/source/vi/pawn-policy.md>) | `pawn-policy.md` |
| S5 | [Pawn specification](<../business/source/vi/pawn-specification.md>) | `pawn-specification.md` |
| S6 | [Member points policy](<../business/source/vi/membership-policy.md>) | `membership-policy.md` |
| S7 | [Loyalty specification](<../business/source/vi/loyalty-specification.md>) | `loyalty-specification.md` |
| S8 | [Partner marketplace policy](<../business/source/vi/partner-marketplace-policy.md>) | `partner-marketplace-policy.md` |

Supplied business policies override old clothing assumptions where explicit. Source examples of database columns/statuses describe business meaning; adapt them to existing code rather than copying an incompatible schema. When sources conflict, retain the conflict in the decision register and keep dependent live behavior disabled until resolved.

## 2. Purchase and product truth — S1

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

## 3. Reservations and deposits — S2, including sections 35–50

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

## 4. Buyback — S3

Required flow: submission -> preliminary appraisal -> inbound delivery -> physical inspection -> final/revised quote -> customer acceptance -> payout -> ownership transfer -> inventory intake.

- Capture front/back/sides, fragile details, box, accessories, defects, repair/custom history, model code and exact version. Upload progress and validation must work on mobile.
- Clearly label photo-based prices as preliminary. Retain quote revisions and the evidence/reason for each revision.
- A revised quote cannot complete without the customer's recorded acceptance. A final quote is not a payment receipt.
- On disagreement, cancel and arrange return shipment with the responsibility for costs recorded under the actual agreement.
- Source allows customers to send via SHIP COD and requires inspection/final acceptance; the exact courier inspection/payment sequence is open. Do not auto-pay a preliminary quote just because an inbound parcel arrived.
- Ownership transfers only after inspection, final agreement and shop payout. Only then create/activate a stock intake, with a unique source reference so retries cannot duplicate stock.

Proposed statuses: `SUBMITTED`, `APPRAISING`, `QUOTED`, `AWAITING_ITEM`, `INSPECTING`, `AWAITING_ACCEPTANCE`, `AWAITING_PAYOUT`, `COMPLETED`, `RETURNING`, `CANCELLED`, `REJECTED`. Avoid inventing automatic valuation or market-price guarantees.

Screens: Sell to Model Universe wizard, request timeline with accept/reject quote, staff intake/inspection/offer workspace, payout confirmation and return-shipment tracking.

## 5. Pawn — S4/S5

Required flow: request -> appraisal -> customer agreement -> bilateral contract confirmation -> asset handover -> disbursement -> active contract -> redemption/extension or overdue contractual resolution.

- Principal must be 50–80% of appraised asset value. Snapshot asset condition/photos, appraisal, selected ratio, principal, dates and contract terms.
- Customer sees interest rate, expected interest, due date, redemption/extension and disposal conditions before confirming.
- S5 specifies simple interest at **0.03% per day**, with the worked example 1,400,000 principal -> 420/day -> 12,600 over 30 days. S4 prose agrees, but its formula says **0.3%**. Decision D1 remains open until the owner confirms.
- After D1, use `interest = min(principal, principal * approvedDailyRate * chargeableDays)` with explicit rounding/day-count policy. Interest starts at actual disbursement. Early redemption charges actual eligible days, not the entire agreed term.
- Reaching the interest cap stops accrual; it does not transfer asset ownership or authorize resale.
- Store custody separately from sellable stock. No buy/sell/agent action may use active pledged assets as available inventory.
- Extensions need approval and recorded old/new due date. Overdue status sends notification; disposal requires contract eligibility plus recorded authorized decision.
- Redemption requires confirmed payment and recorded asset handback. Keep payment completion and handback independently visible so a paid-but-not-returned item is not lost operationally.
- Only permitted disposal can create a stock intake/listing, once, preserving custody and contract references.
- Future loyalty/rate benefits are mentioned as future possibilities, not active overrides of the principal/rate rules.

Screens: pawn request wizard, quote/terms confirmation, private contract summary, live redemption estimate, extension request, staff appraisal/custody/disbursement/redemption/disposal queues. Contract attachments and identity evidence are private; do not reuse public product uploads without access-control changes.

Acceptance includes 50% and 80% boundaries, before-disbursement zero accrual, approved day-count/rounding, cap at principal, early redemption, extension, duplicate payment, overdue without disposal eligibility, authorized intake exactly once, and another customer's inability to access contract files.

## 6. Loyalty — S6/S7

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

## 7. Partner marketplace — S8

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

## 8. Shared operational safeguards

- Reuse session auth and current agent authentication/approval boundaries. Add explicit partner/staff capabilities only as concrete workflows require; no customizable RBAC platform initially.
- Treat admin confirmations, verified provider callbacks and customer consent as distinct events. Browser success pages and uploaded transfer screenshots do not prove money was received.
- Every financial write has an idempotency key/source reference, atomic transaction, actor, timestamp and immutable amount/history. Confirm balances from verified events, not an editable aggregate alone.
- If provider integration is chosen, verify signatures, replay protection, amount/currency/reference and reconciliation. A complete manual bank-transfer verification workflow is a valid initial implementation; a fake live provider is not.
- Private evidence needs authenticated delivery, size/type checks and staff ownership rules. Existing public product upload paths are unsuitable for identity records, bank proofs and pawn contracts.
- Retry reminders and delivery jobs safely. UTC storage and explicit business dates must survive server timezone differences and restarts.
- Reconcile operational money without mixing sales with deposits held, pawn principal/interest, buyback payouts or partner guarantees. Distinguish cash collected, sales revenue and seller liability in dashboards and agent analytics.

## 9. Decision register

Planning can finish with open decisions. Implementation can proceed on independent phases, but cannot silently activate dependent financial policy. Ask focused questions when the relevant phase needs the answer; do not ask the owner to approve the entire plan again.

| ID | Decision / conflict | Recommended draft | Activation gate |
|---|---|---|---|
| D1 | Pawn 0.03% prose/spec vs 0.3% formula | 0.03% matches both prose and detailed example; owner question sent, unanswered at drafting | No live interest calculation until confirmed |
| D2 | Multiple reward tables and member benefit caps | S6 + S7 sections 10–11 tables above; caps/expiry remain explicit settings to approve | Reward redemption and tier discount activation |
| D3 | Commission tiers, 6–7% ambiguity, trust weights, settlement delay/limits | Versioned manually assigned partner fee schedule initially; factual trust badges | Paid partner selling/settlement |
| D4 | Hold price basis, rounding/day cutoff, multi-item holds, extension/top-up interaction | One item/quantity reservation with locked net merchandise price; preserve approved extension days | Reservation payment activation |
| D5 | Payment providers, COD collection proof, shipping fee allocation/pickup, tax | Vietnam-first COD + verified manual transfer; configure actual shipping/pickup support | Checkout/provider and multi-seller fulfillment launch |
| D6 | Pawn day count, rounding, accrual stop event, term, partial redemption, grace period, disposal authority and post-disposal debt/sale reconciliation | S4 ties interest to repayment plus physical handback; S5 describes repayment. Explicitly choose verified repayment or asset handback; no implicit stop on disposal, debt forgiveness, compounding or penalties. Record contract parameters and approve sale-proceeds allocation separately | Pawn contracts/disbursement/disposal and final financial reconciliation |
| D7 | Refund effect on qualifying lifetime/tier, partial refund rounding, discount stacking | Reverse invalid earned points; redemption never reduces tier; one primary benefit | Loyalty refunds and checkout promotions |
| D8 | New return window and order completion/dispute window vs legacy 30 days | Preserve historical promises; explicitly publish new terms | New purchase/partner support policies |
| D9 | Final quote with inbound COD, shipping responsibilities on rejected buyback | Inspection + accepted final amount before completed acquisition | Remote buyback payout |
| D10 | Actual brand facts, media rights, warehouse address, domain, contact and external services | Fill verified owner data; sample values stay demo-only | Publication and live transactions |
| D11 | Vietnam-only vs international operations | Vietnam-first/VND with VI+EN; international shipping and FX are separate additions | Regional shipping/payment activation |

No response has been treated as approval. If answers arrive later, update this register, the translated canonical policy and the corresponding tests together.

## Implementation decision status — 2026-10-08

D1–D11 remain open where owner confirmation is required. A new retained `commerce_policy` approval history records explicit staff choices, actor and version. No financial policy has been approved in the preview/retained database on the owner's behalf; database tests approve fixture policies only in an explicitly named disposable `_test` database. Reservation creation requires the approved D4 price/day/extension interpretation. Pawn rate/day/grace, loyalty table/stacking/refunds/expiry, and seller commission/guarantee/settlement/shipping have explicit activation forms. The forms do not resolve D5/D6/D8/D9/D10/D11 automatically.

### Loyalty implementation review — 2026-10-08

No owner answer has approved D2/D7. The reviewable gated implementation uses the shared v1 reward table, one primary benefit, cumulative net refund rounding, and reversal of qualifying points. Customers explicitly select a tier benefit or owned voucher; sale-priced lines reject an additional member benefit. Voucher cancellation releases the order reservation without undoing the original reward redemption. Issued terms stay immutable. Voucher duration still requires explicit staff approval. These choices are proposed behavior for review, not silently activated business rules. Gift definitions reference actual stock and issued gift snapshots survive later catalog edits.
