# Voucher & loyalty v6.2: refactor and rollout plan

Status 2026-10-22. Source rules: [pricing-voucher-specification](../business/pricing-voucher-specification.md) (canonical)
and the owner's archived v6.2 [BRD](../business/source/vi/voucher-loyalty-v6.2-brd.md),
[SRS](../business/source/vi/voucher-loyalty-v6.2-srs.md) and
[rules and tests](../business/source/vi/voucher-loyalty-v6.2-rules-and-tests.md). The SRS's own order (phases A–E) is kept
and mapped onto this codebase.

## Where things stand (2026-10-23)

| Area | State |
|---|---|
| Owner documents | All Drive documents, the three v6.2 documents and the catalogue workbook archived; every canonical file updated |
| Buy-back table v5.0 | **Done**: `src/shared/buyback-pricing.ts` (`buyback-5.0`), lowest valid S first, quoted requests keep their deduction, stored catalogue prices recomputed (migration `2026-10-23-41-buyback-table-v5`) |
| v6.2 engine | **Done**: `src/shared/voucher-stack.ts`, `evaluateCheckout` in `src/shared/promotions.ts` |
| Checkout, cart, wallet, add-ons | **Done** (phase C, except signed quotes): one main voucher + rank benefit, free shipping as a cost, points never cash, `ruleVersion: 'v6.2'` snapshots without profit figures for customers |
| Loyalty | **Done**: no multiplier, no monthly free-shipping perks, rank benefit shown on the member card and the tier table; legacy entries keep their multiplier for refunds |
| Admin pricing tools | **Done**: calculator and simulation on v6.2 (alone and with each rank) |
| Price and cost data (phase A) | **Open**: R = `product.price`, C = `product.importPrice`, fee 0 |

The owner chose on 2026-10-23 to follow the latest Drive documents, which answered decision V1.

## Decisions still open

1. **V2** the 50,000 VND and 5% floors (shipped). **V3** who approves real list prices and cost profiles (phase A).
   **V4** the return-control period before points are credited. **V5** the 1,120 VND point reserve (shipped). **V6**
   which point and event codes may stack with a rank benefit and the wording customers see (today: every main voucher may,
   after the checks). **V7** rank benefit on partner goods (today: none).
2. Engagement (check-in, wheel, missions, timed drops) and the automatic FREESHIP30 / FREESHIP50 / MEMBER-MONTHLY codes
   are not in the owner documents; they are kept under the v6.2 checks until the owner decides.
3. Agent campaign codes keep their own approved rules (legal limit, autonomy policy, margin floor) and take no rank
   benefit; confirm.

## Phases

### A. Data: approved prices and cost profiles (needs V3)

- New Sequelize models, each with `static async seedData()` and idempotent migrations:
  `approved_price` (product, `regularPriceVnd`, valid from/to, proof, status, approver, version) and `sku_cost_profile`
  (buy-in or purchase cost, repair, handling, packaging, shipping subsidy, fixed fee, expected returns, fee bps, version,
  approver). Buy-back intake writes a draft cost profile from the accepted payout.
- Admin screens under Pricing to propose, approve and retire both, with audit (`promotion_audit`).
- Backfill from `price` / `importPrice` as **unapproved** drafts so nothing is approved by migration.
- Optional import of the owner's sheet "Danh mục 6 hãng" (default weight and dimensions for packing, buy-in price,
  proposed S) once its full content is available; column I is a proposed S, not an R.

### B. Engine (done) and policy configuration (needs V2, V5)

- `voucher-stack.ts` is the single rule engine for the checkout; `pricing.ts` (4.0) stays for the admin calculator until
  phase D, then is retired with its tests.
- Store `ProfitPolicy` (keep ratios, floors, fee, point reserve) and the rank table as versioned `commerce_policy`
  entries so an Admin changes them with approval and every order snapshots the version.

### C. Wallet, rank entitlement, preview and confirm (done except signed quotes and V4)

- `VoucherService`: voucher template states `DRAFT → REVIEW → APPROVED → SCHEDULED → ACTIVE → PAUSED → EXPIRED/ARCHIVED`,
  customer voucher `ISSUED → RESERVED → REDEEMED/RELEASED → EXPIRED/REVOKED`; the draft `MU-*` library seeded as DRAFT
  only.
- Rank benefit from `LoyaltyService` lifetime points (`rankBenefitFor`); remove the points multiplier and points-as-cash
  for new orders.
- `CheckoutService`: `preview` returns every owned voucher with `VOUCHER_INVALID / VOUCHER_ONLY_VALID / STACK_VALID` and
  public reasons, ranked by `rankOptions`, plus a **signed quote** (id, TTL, cart hash, rule version); `confirm` takes the
  quote and an `Idempotency-Key`, reserves stock, voucher and budget in one transaction and stores
  `order.benefitSnapshot` with `ruleVersion: 'v6.2'`. A changed or expired quote needs re-confirmation.
- Points redemption: atomic lock → issue → debit, no second debit on use, `POINTS_INSUFFICIENT` when short.
- Points earning: once per order at `COMPLETED` after the V4 period; reversal entries on refunds (already in the ledger).
- Deposit, hold and COD keep computing from the snapshot (already the case in `fulfillment.ts` / `payment.ts`).

### D. Admin simulator, storefront and refunds

- Admin "simulate voucher": 6 price levels × 6 tiers × the code, plus real SKUs, showing keep ratios, failed guard,
  eligible SKUs and budget forecast; approval by a second admin; pause without touching paid orders.
- Storefront: product page shows R and the price after one code only when entitled; cart shows "Mã giảm …" and
  "Ưu đãi hạng …" separately, the stack-refused message, no profit numbers; wallet tabs (usable, alone only, stacks with
  rank, expired); remove the points toggle and the separate free-shipping slot (subject to V1). All customer text in
  Vietnamese through `src/messages/vi.json`.
- Refunds and cancellations: compensating ledger for points, voucher, quota and budget.

### E. Agent service, load, rollout

- The agent's coupon action (`/promotions/coupons`, source `agent`) must follow the same engine: a contract change in
  `packages/contracts/openapi/web-agent-api.yaml` and `packages/contracts/test-vectors/` in the same change, asserted by
  the web tests and the agent's FakeShop (invariant 9). No limit is raised in that change (invariant 4).
- Concurrency tests on quotas and budget, preview p95 target 500 ms, nightly reconciliation and alerts.
- Roll out per campaign or SKU behind a policy flag; rollback = pause campaigns, orders keep their snapshot.

## Tests to add per phase

A: migrations, approval flow, backfill never approves. C: TC16–TC18, TC24–TC29 as DB tests (`tests/db`), duplicate
webhook, quote races. D: TC20 with fees 0/2/3% and repair ≥ 50k through the simulator; e2e cart copy. E: contract
vectors in both apps; `uv run poe check` in `apps/agent-service`.

## What was not synced

The two spreadsheets in "SẢN PHẨM" were only partly readable (the Drive connector returns 12 sample rows per tab and the
browser extension has no permission for docs.google.com). The documents' links to the v6.0/v6.1 implementation document
and test sheet (`1cMPWdj…`, `1fjktZM…`) return "not found" for this account. See section Z of the
[folder addenda](../business/source/vi/drive-folder-addenda-2026-10-20.md).
