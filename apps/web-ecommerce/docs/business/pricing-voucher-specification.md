# Prices, vouchers, points and the profit guard (owner rules v5.0 – v6.2)

Canonical English interpretation of the owner's pricing and voucher specification (4.0 received 2026-10-16,
[original](source/vi/pricing-voucher-specification.md); revised to **5.0** on 2026-10-20, changes in section K of the
[folder addenda](source/vi/drive-folder-addenda-2026-10-20.md)) **as superseded by the unified rules v5.0 and the
priority appendices v6.0, v6.1 and v6.2 of 2026-10-20** ([archived source](source/vi/unified-business-rules-v5.md)) and
by the **v6.2 BRD, SRS and acceptance-test documents** ([BRD](source/vi/voucher-loyalty-v6.2-brd.md),
[SRS](source/vi/voucher-loyalty-v6.2-srs.md), [rules and tests](source/vi/voucher-loyalty-v6.2-rules-and-tests.md)), all
read from the owner's Drive folder on 2026-10-22. Where they differ, v6.2 wins; the older text is kept below only where
v6.2 does not touch it. The owner marks the v6.2 set as a **proposed specification to implement**, not yet live. Confirmed orders keep the price, voucher, tier benefit and rule they were placed with; nothing
is changed retroactively.

> **Implementation status (2026-10-23).** Checkout, the cart, the voucher wallet, add-on suggestions and the admin
> pricing tools run rule version `v6.2` (`src/shared/voucher-stack.ts`, `src/shared/promotions.ts`). What is done and
> what is still open is listed in [Implementation against v6.2](#implementation-against-v62-2026-10-23).
> `src/shared/pricing.ts` (`voucher-4.0`) remains only for the legacy coupon arithmetic and its tests.

## Four separate values (unchanged, with sharper wording)

- **B – buy-in price**: what the shop paid to import or buy back the model.
- **A – full cost**: B + repair + packaging + handling + the shipping the shop subsidises + fixed fees + expected return
  cost + partner commission or cost the shop bears + the cost of a gift, if one is given.
- **R – list price**: the **real, approved, published** public price. Never an internal or invented one.
- **S – target selling price after the standard 10% voucher**: `S = ROUND(0.90 × R)` (before variable fees).
- **P – what the customer pays for the goods**: the eligible lines minus **exactly one** money-off benefit (plus, at
  most, one rank benefit below); fees the customer pays are published separately.

`R ≈ S / 0.90` is only a test device. Never show a struck-through "old price" derived from S, and never display an R that
has not really been listed or sold. S and R are never a cost. The 6-brand catalogue sheet's column I is a proposed S from
buy-in prices, not a verified R; the catalogue applies it only through the formula an Admin uses for every product (see
[Implementation](#implementation-against-v62-2026-10-23)).

## Profit guard (v5.0 §6–7, v6.2)

Let `f` = total variable fee rate on money actually received, `C` = all cost and shop-borne expense (not including the
point reserve), `giftCost` = real cost of a gift or extra programme cost.

```
PointReserve(P) = FLOOR(eligibleProductPayment(P) / 40,000) × 1,120
Profit(P)       = P × (1 − f) − C − giftCost − PointReserve(P)
P10             = ROUND(0.90 × R)          // goods after the valid standard 10% member voucher on the real R
L10             = Profit(P10)              // the standard profit
```

- `POINT_COST_RESERVE = 1,120 VND per newly earned point`: a prudent provision for approving vouchers, **not** a cash
  rate for customers and not an accounting debt. Release the provision when the benefit is really used, to avoid double
  booking. Raise the factor before opening a point or gift programme that costs more.
- If `L10 ≤ 0`, or R, cost or fee is missing, automatic approval is blocked and the case goes to an Admin.
- Two safety floors, changeable only by an Admin with the version kept: `Profit(P) ≥ 50,000 VND per order` and
  `Profit(P) ≥ 5% × P`. The v6.2 appendix calls them "already adopted"; the v6.2 BRD §14 still lists them as internal
  proposals to confirm. Decided on 2026-10-23 (V2 below): they apply as adopted.
- Low-margin, sale, pre-order and partner goods without a subsidy are excluded from vouchers. Never make up a loss by
  inflating the list price.
- The thresholds are internal. Customer-facing documents state only the benefits a customer can use.

## One main voucher, plus at most one rank benefit (v6.2)

**One money-off slot per order.** The monthly 10% member code, event vouchers (8–25%), fixed-amount codes, referral codes
with a money-off and **point-redemption vouchers** all take that one slot. A free gift, a coin refund or **shop-funded
free shipping** is not an extra slot: its cost joins `C` in the profit check, and it may not be used to get round the
one-code limit. Points are earned after the order, so their reserve is a future cost, not an immediate extra discount.

v6.2 replaced the earlier rule "ordinary codes never combine with a rank benefit": any valid main voucher may be topped up
with **one** rank benefit.

| Tier | Qualifying points | Rank benefit | Cap |
|---|---:|---:|---:|
| Đồng (Bronze) | 150 | +0.5% | 15,000 |
| Bạc (Silver) | 250 | +0.75% | 25,000 |
| Vàng (Gold) | 500 | +1% | 40,000 |
| Bạch Kim (Platinum) | 1,500 | +1.25% | 50,000 |
| Lục Bảo (Emerald) | 3,500 | +1.5% | 65,000 |
| Kim Cương (Diamond) | 10,000 | +2% | 100,000 |

The earlier 2 / 4 / 6 / 10 / 12 / 15% tier discounts (`MU-TIER02…15`) are retired for new orders; they are no longer an
independent discount (`MU-RANK01…06` replace them).

Both amounts use the **same list price R** as their base, not one after the other (12% + 2% = 14% nominal):

```
discount = MIN(voucher% × R_eligible, voucher_cap) + MIN(rank% × R_eligible, rank_cap)      // never above R_eligible
fixed-amount voucher: MIN(value, cap, R_eligible)
```

Round every part the same way and publish the caps; never trim a percentage or cap after the customer has confirmed.
The minimum-order threshold is compared with the R of the eligible SKUs before the code. Goods outside the SKU group are
not part of the base.

### Two checks, in this order

1. **The voucher alone.** `Pplain = R − Dvoucher`, `Lplain = Profit(Pplain)`. Valid only if `Lplain ≥ 80% × L10` **and**
   `Lplain ≥ 50,000` **and** `Lplain ≥ 5% × Pplain`, and the code is in date, owned or affordable in points, the SKU is on
   the allowlist, and the minimum order, quantity, quota, budget and funding source hold.
2. **Adding the rank benefit** (only if step 1 passed). `Pstack = MAX(0, R − Dvoucher − Drank)`, `Lstack = Profit(Pstack)`.
   Valid only if `Lstack ≥ 75% × L10` **and** `≥ 50,000` **and** `≥ 5% × Pstack`. If it fails, the rank benefit is **not**
   added and the voucher alone still applies. Step 2 passing never excuses step 1 failing.

Never two main vouchers or two rank benefits. If SKU or profit changes, recompute before confirming and say so openly;
never quietly reduce a benefit. Backend result: `VOUCHER_INVALID`, `VOUCHER_ONLY_VALID` or `STACK_VALID`, with a reason
(`INSUFFICIENT_PROFIT_80`, `INSUFFICIENT_PROFIT_75`, `MIN_ABSOLUTE_PROFIT`, `MIN_MARGIN`, `SKU_INELIGIBLE`,
`POINTS_INSUFFICIENT`, `EXPIRED`, `BUDGET_EXCEEDED`). Checkout locks the money amounts, prices, vouchers, tier benefit and
`rule_version = v6.2`.

Worked test (mandatory for every tier, price band and open code): R = 1,666,667, B = 1,250,000, no extra fee.
`P10 = 1,500,000`, 37 points, `L10 = 208,560`. KIT12 (12%, cap 500,000) takes 200,000 → `Pplain = 1,466,667`, 36 points,
`Lplain = 176,347` = 84.55% → passes. Diamond +2% takes 33,333 more → `Pstack = 1,433,334`, 35 points, `Lstack = 144,134` =
69.11% → the rank benefit is blocked; KIT12 stays.

**Ambiguities in the source, for the owner:** (a) v6.0/v6.1 compute the rank benefit on **S** and add a dynamic cap
`MIN(ROUND(S × rank%), cap, FLOOR(25% × L10 / (1 − f)))` (the source text reads "25×L10", almost certainly 25%); v6.2,
the latest, uses **R** and the two checks above. This document follows v6.2. (b) v6.1 says the monthly 10% code plus a
rank benefit is the only stacking exception; v6.2 widens it to every main voucher.

## Engine arithmetic and checkout flow (v6.2 SRS)

- **Integers only.** Money is whole VND; rates are basis points (10% = 1000 bps, 0.75% = 75 bps); rounding is
  `ROUND_HALF_UP` on non-negative values; never JavaScript floats for money.
- `Dprimary = MIN(round(R_eligible × bps / 10000), cap, R_eligible)`; a fixed code is `MIN(amount, R_eligible)`.
- `Drank = MIN(round(R_rank_eligible × rank_bps / 10000), rank_cap, R_eligible − Dprimary)`. `R_rank_eligible` is the list
  value of the lines **both** the voucher and the rank benefit accept. When the two SKU sets differ, allocate each
  discount line by line; never advertise one combined rate that some lines do not get.
- `PaidProductSubtotal = R − Dprimary − Drank` (or `− Dprimary` alone), never below 0. Shipping and fees the customer pays
  are separate lines; shipping the shop subsidises is part of `C`.
- `L10 = Profit(round(0.9 × R))` on the same basket. Missing R, cost, fee or approval, or `L10 ≤ 0` → **block**
  (fail closed, BR-018).
- **Preview.** Load stock, approved R, cost profile, fee, the customer's points / rank / entitlements and every owned or
  accessible voucher; validate date, quota, budget, minimum order, SKU, item count, funding and point entitlement; run step
  1 then step 2; sort the valid options by final payable, then fewer points spent, earlier expiry, smaller campaign budget
  (configurable). Return a **signed quote** with an id and TTL and the breakdown, without any profit field.
- **Confirm** takes the signed quote and an idempotency key; stock, voucher and budget are reserved atomically and the
  snapshot stored. A changed or expired quote is rejected until the customer re-confirms (TC29). After confirmation
  nothing is recomputed: deposit, COD and reconciliation use the snapshot.
- **States.** Voucher template `DRAFT → REVIEW → APPROVED → SCHEDULED → ACTIVE → PAUSED → EXPIRED / ARCHIVED`; customer
  voucher `ISSUED → RESERVED → REDEEMED / RELEASED → EXPIRED / REVOKED`. `discount_type` is `PERCENT | FIXED | GIFT |
  SHIPPING`; only PERCENT and FIXED are main vouchers, GIFT and SHIPPING carry their real cost and budget. Funding is
  `SHOP | SELLER | SHARED`. Rank entitlements are `MU-RANK01 … MU-RANK06`. A sample on a spreadsheet is never a live code.
- **Business rules** BR-001 … BR-018 are listed in the [SRS](source/vi/voucher-loyalty-v6.2-srs.md) §8; the engine's
  tests name them.
- **APIs proposed by the SRS.** Admin: `buyback-quote`, `calculate-published-price` (R is never approved by algebra),
  `vouchers/simulate`, `vouchers` (create DRAFT), `PATCH vouchers/:id` (no silent change to active or used terms),
  `vouchers/:id/approve` (separate approver), `vouchers/:id/pause`, `promotions/report`, `loyalty/rank-policy` (versioned,
  approved), `loyalty/points-adjust` (compensating entries only). Customer: `GET /me/loyalty`, `GET /me/vouchers`,
  `GET /promotions/eligible`, `POST /checkout/preview`, `/checkout/select-voucher`, `/checkout/confirm`,
  `/me/points/redeem`, order cancel / refund. Timezone `Asia/Ho_Chi_Minh`; rate-limit preview and redemption against
  code enumeration and timing leaks of profit.
- **Non-functional targets (proposals, not SLAs).** Preview p95 under 500 ms with cached cost and rules; nightly
  reconciliation of redeemed vouchers, reserve, points liability, refunds and promotions; alerts for negative-profit
  orders, failing guards, double points, budget overruns and unapproved price versions.

## What the customer sees (v6.2 BRD §10, SRS §9, rules §8)

- Product page: R, the price after one code if the customer is entitled, the saving and whether a rank benefit applies.
  Badge only vouchers tested for that SKU; no false "save %" and no invented compare-at price. A capped 25% code is never
  advertised as "25% off".
- Cart: every owned voucher with its state (`VOUCHER_INVALID`, `VOUCHER_ONLY_VALID`, `STACK_VALID`); "Mã giảm …" and
  "Ưu đãi hạng …" as **separate lines**, plus total savings. When the stack fails, say the code still applies alone and
  "Ưu đãi hạng không áp dụng cùng mã này cho sản phẩm/giỏ hiện tại"; suggest other SKUs but never add one to the cart.
- Checkout: R, Dv, Dr, goods P, shipping and fees, deposit, amount still due, points to be earned on completion, quote
  expiry and the effective total %. No hidden second voucher.
- Wallet: owned, usable, "alone only", "stacks with rank", expired, and rank progress.
- Public reasons only (minimum order, expired, SKU not included, rank benefit not available here). Never costs, L10 or
  profit ratios.

## Replacement rules that still hold

- Every main voucher (ordinary, event, fixed or point) needs `Lplain ≥ 80%` of L10 plus the floors. **The 78% basket
  level is retired** (BRD §8E, specification 5.0 §3/§26/§27): an upsell basket uses the same 80% / 75% branch ratios on
  its own L10 **and** `Profit(newCart) ≥ Profit(originalCart)` on the same basis (BR-014). The 78% still printed in the
  v5.0 appendices and in appendix 13.3 step 5 is superseded.
- A point voucher takes the voucher slot and never adds the 10% code. Once issued it is a main voucher like any other,
  so it may be topped up with one rank benefit if it passes both checks (BRD §9, v6.2 rules §3); the v5.0/v6.0/v6.1
  sentence "a point voucher adds no rank benefit" is superseded. Points are deducted atomically when the code is issued
  (lock while issuing, release if issuing fails) and never again when it is used. If a point voucher is worse for the
  customer than the free 10% code, the system must not suggest spending points (TC16).
- A purchase voucher never applies to buy-in payouts, pawn disbursement or fees, or marketplace payouts.
- Anything lacking cost, a real R, the fee or approval is not applied automatically.

## Voucher fields and approval (v5.0 §9, appendix 13)

Required: `voucher_id/code`, `name`, `funding_party` (SHOP / SELLER / SHARED), `type` (PERCENT / FIXED / SHIPPING / GIFT),
`value`, `max_discount_amount`, `minimum_order_amount`, `eligible_skus/categories`, `excluded_skus`, `target_member_tier`,
`one_per_order = true`, `max_uses_per_customer`, `total_uses`, `start_at`, `expires_at`, `campaign_budget`,
`redemption_point_cost`, `gift_real_cost`, `fee_owner`, `minimum_net_profit`, `minimum_margin`, `max_profit_loss_ratio`
(v5.0: 20% single, 22% genuine upsell; v6.2: 20% alone, 25% with a rank benefit, for baskets too), `point_cost_reserve_version`, `buyback_tier_version`, `approval_by`,
`published_terms_version`, `status`, audit log. Flow: Admin drafts → simulate on the catalogue and representative baskets
→ filter profitable SKUs → add point reserve and fees → compare with the 10% and rank discount → review the price-band
boundaries, returns and deposit transactions → lock configuration and budget → publish cap, validity and terms → watch use,
real profit and budget → stop when a threshold breaks. A code with no basket better than the default is not released.

Release checks: verify the real R; compute C; compute P, earned points and reserve; compute L10 and L_voucher; single item
`≥ 80%` (`≥ 75%` with a rank benefit); a real upsell the same ratios on the basket's own L10 and `L_new ≥ L_original`
(v5.0's 78% is superseded); floors 50,000 and 5% (Admin-approved); check
stock, status, budget, expiry, uses, tier, points and seller funding; compare with existing codes and offer the cheapest
valid one; freeze price and rule at order confirmation; roll back points and vouchers on refund or cancellation.

**Draft code library (appendix 13.2).** All are samples with status DRAFT, not live vouchers, until the SKUs, real list
price, budget, expiry and ownership are approved: `MU-WELCOME08` 8% (cap 100k, ≥300k, new customers, once),
`MU-MEMBER10` 10% (≥500k), `MU-KIT12` 12% (cap 500k, ≥800k), `MU-CART14` 14% (cap 280k, ≥1.2M), `MU-BUNDLE16` 16% (cap
500k, ≥2M, ≥2 items), `MU-EVENT18` 18% (cap 650k, ≥2.5M, high-margin SKUs only), `MU-VIP20` 20% (cap 800k, ≥3M),
`MU-VIP22` 22% (cap 900k, ≥4M), `MU-FLASH25` 25% (cap 1M, ≥5M, ≥2 high-margin items), `MU-POINT50` (60 points, 50k,
≥500k), `MU-POINT100` (110 points, 100k, ≥1M). The sheet behind them lists 12 point codes, 6 tiers and 36 tests.
Brand-level approval is not enough: every SKU/variant needs real cost and a published price.

## Points (v5.0 §4–6)

`earnedPoints = FLOOR(eligible product payment after every discount / 40,000)`, once, when the order is `COMPLETED` and the
Admin-configured return-control period has passed. None on a deposit or hold; none on shipping, COD, fees, tax that is not
eligible, pawn interest, service fees, money the shop pays for a buy-in or trade, refunded amounts, the voucher-covered
part, cancelled orders, or seller/partner payments. A trade earns points only on the **new purchase money the customer
really pays**. Old transactions need evidence, one award per transaction, no back-dating for buy-in or refunded money.

Keep separate: lifetime (rank) points, available points, pending points, reserved points, debit/reversal. Spending never
lowers the tier. A refund writes a `REVERSAL` entry (history is never deleted); if it leaves a negative obligation, manage a
debit / carry-forward and block redemption until it balances. No double award through webhooks, deposits, redelivered COD
or partner reconciliation. Points are never cash.

**Redemption templates** (configuration samples, not applicable to every SKU; each needs SKU profit, cap, budget and
validity): money 60/110/160/210/500/900 points → 50k/100k/150k/200k/500k/1,000k for orders ≥ 500k/1M/1.5M/2M/5M/10M;
percent 50/100/200/350/500/800 points → 2/3/5/7/10/12% capped 100k/150k/250k/300k/500k/700k. A gift is valued at its real
cost plus shipping and packing, not its advertised value.

## Payment, partners, refunds (v5.0 §10)

- Deposit = a percentage of the **goods total after the locked voucher and before shipping**; the deposit is a part
  payment, not second revenue. No points at deposit. Paid in full or COD: guard against counting points twice; a partial
  refund reverses points on the real net amount.
- Marketplace: the shop's cost is never inferred from the buy-in price of seller-owned goods; fees and subsidies the
  parties bear are settled separately; the shop does not absorb a seller's voucher or points without a budget or
  agreement. By default no shop voucher and no points on seller payout or guarantee refunds (see
  [partner-marketplace-policy](partner-marketplace-policy.md)).
- Pawn: disbursement, repayment, interest and fees earn no points and use no purchase voucher.
- Refund or cancellation reverses voucher, points, fee and seller discount through the ledger; a corrected entry is an
  adjustment with evidence, never an edit of a confirmed order's price.

## Mandatory tests (v5.0 §11)

T1–T7 buy-back tiers (see [buyback-policy](buyback-policy.md)); T8 B = 900k no-defect → S = 1.15M (not 1.1M); T9 overlapping
bands → lowest valid S, other option recorded; T10 10% or 12% + Diamond 2% tried on R, succeeding only through both
checks; T11 a 25% voucher applies its cap and the real `Profit(P)`; T12 a 1M order after a 100k voucher →
`FLOOR(900k / 40k) = 22` points; T13 deposit → 0 points, refund after earning → `REVERSAL`; T14 buy-in or trade money paid
by the shop → 0 points, trade top-up → only the customer's real goods money; T15 profit below 80% / 78%, or below the
absolute or margin floor → blocked; T16 a point code never deducts twice, nor without enough points, and a gift counts its
cost; T17 partial refund, subsidised shipping, COD → correct amounts and ledger; T18 expired, out of budget or ineligible
SKU → not applied, confirmed price unchanged; T19 an unverified public price → no struck-through price from S/0.9; T20
before opening a 14–25% code simulate many price levels and groups (500k / 1M / 1.5M / 2M / 3M / 5M).

One backend rule engine owns buy-back tiers, checkout discount, earned points, redemption, profit guard and the version
snapshot; the frontend only shows API results. Admins approve S, R, fees and budgets and never publish a simulated price as
a real one. When the policy changes, update the buy-back, voucher, points, sales, deposit, shipping and marketplace
documents together, with regression tests.

## v6.2 acceptance tests (rules and tests §6–7)

R values are test assumptions (`R = ROUND(S / 0.9)`), never real list prices; no fee unless stated; C = B.

| Case | Input | Expected |
|---|---|---|
| TC01–TC06 | S/B = 500k/400k, 1M/800k, 1.5M/1.25M, 2M/1.65M, 3M/2.55M, 5M/4.5M; MEMBER10 | pays S; points 12 / 25 / 37 / 50 / 75 / 125; L10 86,560 / 172,000 / 208,560 / 294,000 / 366,000 / 360,000 |
| TC07 | KIT12 at R 1,666,667, B 1.25M | −200,000, P 1,466,667, 36 pts, 176,347 = 84.55% → passes alone |
| TC08 | TC07 + Diamond | −33,333, P 1,433,334, 35 pts, 144,134 = 69.11% → stack blocked, KIT12 alone stays |
| TC09 | KIT12 at R 1,111,111, B 800k (+ Diamond) | alone P 977,778, 150,898 = 87.73% → passes; Diamond −22,222 then recompute everything (129,796 = 75.46%, floors met → stack valid) |
| TC10 | 14% at R 1,666,667 | 144,134 = 69.11% → blocked alone and stacked |
| TC11 | 14% capped 280k at R 2,222,222, B 1.65M | P 1,942,222, 48 pts, 238,462 = 81.11% → passes alone |
| TC12 | 12% at R 3,333,333, B 2.55M | P 2,933,333, 73 pts, 301,573 = 82.40% → passes alone |
| TC13 | 12% capped 500k at R 5,555,556 | pays 5,055,556 > 5,000,000 with MEMBER10 → not suggested |
| TC14 | FLASH25 capped 1M at R 5,555,556, cost 4.5M | P 4,555,556, profit −71,004 → blocked |
| TC15 | FLASH25 capped 1M, R 6M, cost 2.5M | P 5M, 125 pts, 2,360,000 vs L10 2,748,800 = 85.86% → passes alone (still needs ≥ 2 items, SKUs, quota) |
| TC16 | point voucher 100k at R 1,111,111 vs MEMBER10 | 1,011,111 vs 1,000,000 → show the free option first |
| TC17 | not enough points to redeem | `POINTS_INSUFFICIENT` (TC17 writes `INSUFFICIENT_POINTS`; the v6.2 reason list wins), nothing deducted |
| TC18 | expired, used up, over budget, excluded SKU | not usable, even if profit passes |
| TC19 | unverified R | fail closed, no compare-at from S / 0.9 |
| TC20 | 6 tiers × 500k … 5M × 8/10/12/14/16/18/20/22/25%, fees 0/2/3%, repair ≥ 50k, changing prices | matrix |
| TC21–TC24 | alone passes, stack fails; alone fails; both pass; two vouchers or two ranks | `VOUCHER_ONLY_VALID` + `INSUFFICIENT_PROFIT_75`; `VOUCHER_INVALID` (no stack attempt); `STACK_VALID` with `Dprimary + Drank` on the same R; refused |
| TC25–TC28 | deposit, completion, refunds, trade / buy-in / pawn / payouts | deposit after the code, no points at deposit, COD never adds shipping twice; points once on `COMPLETED`; compensating entries; 0 points on money the shop pays |
| TC29–TC30 | cost rises before confirmation; upsell | new quote needs re-confirmation, paid orders keep their snapshot; upsell needs the branch ratio and `Profit(new) ≥ Profit(original)` |

The QA matrix is at least **6 price levels × 6 tiers × 9 main vouchers = 324** combinations, each run plain then stacked,
asserting that `STACK_VALID` never appears when the voucher alone fails, plus zero revenue, prices above 5M, negative
inputs, the 39,999 / 40,000 point boundary, fees above 0 and two SKUs with uneven eligibility. The 75% is a **share of
profit kept**, not a 75% margin. Keep fixture SKUs apart from real SKUs.

## Owner decisions v6.2 left open, and how they were settled (2026-10-23)

The owner asked on 2026-10-23 for the code to follow the latest Drive documents and to settle what they leave open. Each
answer below follows the documents where they say anything, and otherwise takes the more cautious choice. The owner can
change any of them; each one names where the change is made.

| # | Question (BRD §14 and conflicts found while syncing) | Decision |
|---|---|---|
| V1 | The marketplace stacking chosen in-session on 2026-10-21 vs v6.2 | **v6.2 applies** to new orders (owner, 2026-10-23). Codes and points already issued are honoured |
| V2 | The 50,000 VND and 5% floors (BRD §14 "to confirm" vs the v6.2 appendix "adopted") | **Adopted** as the appendix says (`DEFAULT_PROFIT_POLICY`). They are internal guards, never published. An Admin may approve a stricter `voucher` commerce policy (higher keep ratios, floors, fee or reserve; never lower), and every order records `ruleVersion: 'v6.2'` and the `policyVersion` it was checked with |
| V3 | Approved list prices and real cost profiles | **The published product price is the approved R and the recorded actual cost is C.** An Admin publishes R only through the catalogue formula from S (`catalogFormula`; a typed-over price is refused), and every create or change of R, S, the buy-back price or the cost is written to `promotion_audit` (`product_pricing`) with who and what. C is `product.importPrice`, kept from the stock receipts. Fee 0: the shop's own bank transfer and COD carry no percentage fee in the system. A product with a missing or zero cost or price still blocks every code (`MISSING_DATA`). On top of that, as the SRS proposes, an Admin can record an **approved list price** (with proof of where it is published) and a **cost profile** (buy-in, repair, packaging, handling, subsidised shipping, fixed fees, expected returns) per product; each is proposed by one admin and approved by a second (`SEPARATE_APPROVER`). With an approved cost profile, C is its total, using the latest receipt price when that is higher than its buy-in. With an approved price, a product whose price no longer matches it takes no code until the new price is approved. The `voucher` policy setting `pricingApproval: 'required'` blocks codes on every product without an approved price |
| V4 | The return-control period after `COMPLETED` before points are credited | **Admin-set in the loyalty policy (`returnControlDays`, 0–30 days), defaulting to the whole 30-day return-request window** for a policy approved before the setting. Points are credited once, by a scheduled job, when the order is paid, delivered, undisputed and past the period |
| V5 | The 1,120 VND / point reserve against real redemption cost | **Kept at 1,120** (the documents' figure). The money templates pay 833–1,111 VND per point, under the reserve. The small percentage templates can pay more at their caps (up to 2,000 VND per point for 50 points → 2% capped at 100,000), but a point voucher is a main voucher: its whole discount sits inside the profit checks of the order that uses it, so the reserve is only a provision and is never the guard. Raise it before a costlier point or gift programme, as §6 says |
| V6 | Which point vouchers and event codes may stack with a rank benefit, and the wording before use | **Every main voucher**, point and event codes included, as v6.2 §3 says, and only when both checks pass. The cart and the voucher picker show the rank benefit as its own line, or the plain reason it does not apply |
| V7 | Rank benefit on partner goods | **None.** Partner lines are outside every shop voucher and the rank benefit (`shopOwned`), and earn no points |

Not covered by the documents, decided the same way:

- **Agent campaign codes** keep their own approved rules (the legal 50% limit, the autonomy policy and the margin floor,
  invariants 1 and 4) and take no rank benefit; free shipping on top of them must still pass the checks.
- **Engagement** (check-in, wheel, missions, timed drops) stays. Its codes are main vouchers under the same checks; its
  points never count for tiers and are spent only on point vouchers.
- **Standing codes.** `MEMBER-MONTHLY` is the standard 10% member code that L10 is defined on. `FREESHIP30` and
  `FREESHIP50` stay: shop-funded shipping is a cost inside the profit check, so a free-shipping code is refused whenever
  it would break an accepted benefit.
- **Quotes.** The cart quote returns a **signed quote id** valid for 30 minutes (`CheckoutQuote.ts`, HMAC, nothing
  stored) that binds the lines, their prices, the accepted codes, the voucher and rank discounts, the rule version and the
  policy version. Placing the order recomputes everything and refuses a forged id (`QUOTE_INVALID`), an expired one
  (`QUOTE_EXPIRED`) or one that no longer matches (`PRICE_CHANGED`), as it already refuses a changed confirmed total, so
  the customer confirms again (TC29). Shipping is quoted separately and covered by the confirmed total. A QR checkout
  checks the quote when it opens; from then on the session and its payment deadline are the quote, so a payment that
  arrives later never fails on the quote's age. A placed order keeps its snapshot.
- **Rate limits** against code enumeration and timing probes of the guard: at most 20 different codes per customer (or
  address) in 15 minutes on the cart quote, re-quoting the same code never counts; at most 30 point redemptions in
  15 minutes.
- **Nightly reconciliation** (`PromotionReconciliationService`, Admin → Pricing → Promotion reconciliation): for the
  previous Vietnam day, the voucher, rank and free-shipping money given, the guard's results, points earned, reversed
  and redeemed with their reserve, and the points liability; an operational alert for orders below zero profit after
  benefits, an order credited twice, or a product whose price changed after approval. Budget overruns cannot happen (the
  `coupon_budget_valid` constraint refuses them).
- **The owner's catalogue workbook** gives each product its default box and weight for the package optimizer, matched on
  brand and manufacturer code, and CD-01's buy-in (2,200,000) and S (2,650,000). Its scale column is not applied: for
  the MNP-XH, MNP-CR, UTX-6030 and NBD-009 codes it says 1/100 where the researched catalogue says 1/72 or 1/10.

## Implementation against v6.2 (2026-10-23)

The owner asked on 2026-10-23 for the code to follow the latest Drive documents, which answers decision V1: the v6.2
rules replace the marketplace stacking of 2026-10-21 for new orders. Orders and points recorded before keep their own
rules.

| Area | v6.2 (owner, 2026-10-20) | Code now |
|---|---|---|
| Rule version | `v6.2` snapshot on every order | **Done**: `order.benefitSnapshot.ruleVersion = 'v6.2'`, status, voucher, rank and free shipping; the profit figures sit under `internal` and are stripped from every customer response (`publicBenefitSnapshot`) |
| Profit keep | 80% alone, 75% with rank; floors 50,000 and 5% of P | **Done**: `src/shared/voucher-stack.ts` (`DEFAULT_PROFIT_POLICY`), used by the cart, checkout, wallet evaluation, add-ons, admin calculator and simulation |
| Point reserve | 1,120 VND per point inside `Profit(P)` | **Done** |
| Rank benefit | +0.5 … +2% on R with caps 15k … 100k, topping up one main voucher after the two checks | **Done**: `rankBenefitFor(lifetime)`; the points multiplier and monthly free-shipping perks are gone (`/promotions/perks` removed); codes already issued stay usable until they expire |
| Points at checkout | never cash; only point vouchers and gifts | **Done**: `redeemPoints` is refused with `POINTS_NOT_CASH` at checkout and ignored by the cart quote; the cart shows the points the order will earn |
| Stacking | one main voucher + at most one rank benefit; shipping and gifts count in the profit check | **Done**: `evaluateCheckout` (`src/shared/promotions.ts`): voucher (refused, never shrunk), rank on top, then free shipping only if its cost keeps every accepted benefit |
| Point voucher + rank | allowed after both checks | **Done**: point vouchers are ordinary main vouchers (no more "prepaid" exemption) |
| Upsell basket | 80% / 75% of the basket's L10 and not below the original cart's profit | **Done** (`suggestAddOns`, `upsellAllowed`) |
| Backend result codes | `VOUCHER_INVALID` / `VOUCHER_ONLY_VALID` / `STACK_VALID` with reasons | **Done** in the cart quote and the wallet evaluation; customers see a plain reason, never a profit figure |
| Point earning | one point per 40,000 VND after `COMPLETED` and the return-control period | **Done**: multiplier removed (orders first rewarded with a multiplier keep it for refund recalculations); points wait for `returnControlDays` of the loyalty policy after delivery and are credited by the minute job `LoyaltyService.creditMatured`; the member page shows the credit date |
| Agent campaign codes | not covered by the owner documents | **Decided** (above): own approved rules, no rank benefit, free shipping on top must pass the checks |
| Engagement (check-in, wheel, missions, timed drops) | not in the owner documents | **Decided** (above): kept; codes are main vouchers under the same checks |
| Standing codes | `MU-*` library, all DRAFT until approved | **Decided** (above): `MEMBER-MONTHLY`, `FREESHIP30` and `FREESHIP50` stay, checked by v6.2 at use |
| Quotes | signed quote with TTL, re-confirmation on change | **Done**: signed quote id (30 minutes) checked when the order is placed, plus the confirmed total; rate limits on quotes with codes and on redemptions |
| Price and cost data | approved R with proof and version; versioned cost profile | **Done (V3)**: `product_price_approval` and `product_cost_profile` (versioned, proposer and second approver, audited), read by the cart, checkout, wallet, add-ons, simulation and the direct-sale floor (`PricingApprovalService`); without records R is the formula-published price and C the receipt price. Admin → Pricing → Approved prices and costs. The owner workbook's defaults are applied (migration `2026-10-23-42-catalog-owner-defaults`) |
| Floors and reserve | owner to confirm 50,000 / 5% and 1,120 | **Done (V2, V5)**: 50,000 / 5% and 1,120 by default; a stricter `voucher` commerce policy can be approved, and orders record its version |
| Reconciliation and alerts | nightly reconciliation; alerts for negative profit, failing guards, double points, budget overruns, unapproved prices | **Done**: `PromotionReconciliationService` (minute job, one row per day) and an operational alert |

## Voucher terms, add-ons and admin tools (from 4.0, still in force)

Percentage vouchers carry an optional cap, minimum order, eligible and excluded SKUs, cart type (any, single, basket),
campaign budget (used amount grows per order and is restored on cancellation), usage limit, validity and public wallet
visibility; every create or update is audited (`promotion_audit`); issued member codes cannot be edited. The **monthly
member voucher** is a `member_template` copied once per customer per Vietnam month (`M<YYMM>-<userId>`, single use, expires
at month end). **Best voucher:** every usable code is evaluated on the cart and the one that leaves the customer paying the
least is proposed. **Add-on suggestions:** in-stock shop products that unlock a better voucher the customer owns, only when
the new basket passes the profit checks above and earns the shop more than the current cart; ranked by compatibility,
extra profit, then smallest extra spend; never added automatically; the cart shows current and new payable amounts, the
extra spend and the extra saving separately. **Expiry reminders:** 72 h and 24 h before an owned code expires (website
and email), once each, never for used codes. **Admin Pricing and vouchers page:** resale candidates from a buy-back price,
list price for a target member price, the safe voucher range, and a catalogue simulation of a voucher (eligible and
ineligible SKUs and why, average discount, profit after discount, loss rate, products where it beats the 10% code, and
whether it should be offered catalogue-wide).

Deposits are computed after the voucher (1,222,222 list → 1,100,000 member price → 110,000 minimum deposit). Agent and
loyalty coupons keep their existing rules; confirmed orders keep their voucher terms and profit evaluation
(`order.benefitSnapshot`).

Tests: `tests/unit/pricing-vouchers.test.ts` (4.0 cases), `tests/unit/promotions.test.ts`, `tests/db/deposit-delivery.test.ts`.
v6.2: `tests/unit/voucher-stack.test.ts` (TC01–TC24 arithmetic and the 324-combination matrix),
`tests/unit/promotions.test.ts` (voucher, rank and free shipping together) and `tests/db/promotions.test.ts` (Diamond on the
member code, the rank refused at 69.11%, points not cash, no profit figures for customers). The rollout plan is
[voucher-loyalty-v6.2-plan](../model-universe/voucher-loyalty-v6.2-plan.md).
