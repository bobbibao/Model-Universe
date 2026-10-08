# Implementation handoff: Model Universe

Intended implementer: GPT 6.1-sol as requested by the owner. This file is a reusable prompt/checklist, not an instruction for the planning session to begin implementation.

## 1. Copyable starting prompt

> Implement the Model Universe refactor from the linked plan in this directory. Begin by inspecting the current repository and instructions; do not assume the planning snapshot is still exact. Read refactor-plan.md, business-requirements.md and experience-design.md, then the original policy documents relevant to the phase.
>
> Execute in bounded phases. Start with phase 0, then ship complete vertical flows in dependency order. Preserve existing working commerce and agent security; do not rewrite the platform or add speculative abstractions. Every new service, endpoint, model and UI action must have a specified purpose and real integration. Mark proposed code as new; never claim an existing API or package without checking it.
>
> Use English code, file/folder names, identifiers, comments and developer documentation. Deliver Vietnamese and English application content through locale resources and translated catalog content. Rebrand the system/repository as Model Universe, with model-universe as the repository slug. Preserve original source evidence and historical transactions truthfully.
>
> Follow the phase acceptance gates, source business rules, performance targets, design brief and media provenance requirements. Adapt competitor interaction patterns into an original Model Universe design; do not copy unlicensed assets or code. Use MorphSVG/Lottie only in the bounded lazy-loaded treatments described in the design brief.
>
> Before activating money-related features, resolve only the relevant open policy decisions with the owner. Continue independent work while waiting. Do not infer authorization from silence, silently choose conflicting rates, invent provider credentials or present a mock integration as a real one.
>
> Keep the app runnable after each phase. Run appropriate existing checks, add behavioral tests for financial/concurrency boundaries, and report actual results and limitations. Update the progress table and decision register with changed files, verified behavior, migrations, tests, performance and remaining work. Do not mark the full refactor complete until every required domain and final cutover gate is satisfied.

Links for the implementer:

- [Master plan](./refactor-plan.md).
- [Business source register, invariants and decisions](./business-requirements.md).
- [UI/UX and asset brief](./experience-design.md).
- [Existing project overview](../PROJECT_OVERVIEW.md) — useful map with some stale constraints noted in the plan.
- [Root architecture](../../../../docs/ARCHITECTURE.md), [runbook](../../../../docs/RUNBOOK.md), [contract](../../../../packages/contracts/openapi/web-agent-api.yaml).

## 2. First implementation session

1. Read current applicable instructions and `git status`. Preserve unrelated changes and owner-supplied untracked documents. Inspect actual package versions and active process/port state.
2. Inventory existing routes, controllers, services, models, seeds, image sources, localization literals, brand strings, private/public uploads and cross-language agent contracts. Record **existing / change / new** for every requested capability.
3. Create the canonical English policy/source map without losing the original documents. Carry disputed values into the decision register instead of correcting source evidence silently.
4. Record current test results and a reproducible performance baseline. Never run a destructive seed command against a retained database. Identify the disposable database explicitly before DB tests.
5. Select one reference design direction from the experience brief and implement a reviewable thin slice: locale-aware branded shell, real seeded catalog data, home/catalog/product prototypes. Avoid spending the whole session reorganizing folders or generating unused components.
6. Finish and verify that slice before adding another domain. Log the state below so a later session can resume without reconstructing assumptions.

## 3. Critical file touchpoints

These are inspected existing paths. New files must follow established conventions after inspecting neighboring implementations.

| Change | Existing anchors |
|---|---|
| Brand + global rendering | [BrandLogo](../../src/components/BrandLogo.tsx), [root layout](../../src/app/layout.tsx), [store layout](../../src/components/Layouts/StoreLayout.tsx), [header](../../src/components/StoreHeader/index.tsx), [footer](../../src/components/StoreFooter/index.tsx), [MailService](../../src/core/server/services/MailService.ts) |
| Catalog + filters | [product types](../../src/shared/types/product.d.ts), [Product model](../../src/core/server/database/client/models/Product.Model.ts), [ProductService](../../src/core/server/services/ProductService.ts), [Product controller](../../src/app/api/Product.Controller.ts), [shop features](../../src/core/client/features/shop/), [product admin](../../src/core/client/features/product-management/) |
| Money + stock | [CartService](../../src/core/server/services/CartService.ts), [OrderService](../../src/core/server/services/OrderService.ts), [CouponService](../../src/core/server/services/CouponService.ts), [ReturnService](../../src/core/server/services/ReturnService.ts), [StockImportService](../../src/core/server/services/StockImportService.ts), [Order model](../../src/core/server/database/client/models/Order.Model.ts), [OrderItem model](../../src/core/server/database/client/models/OrderItem.Model.ts) |
| Authentication + locale | [page middleware](../../src/middleware.ts), [API access rules](../../src/core/server/routes/Auth.Route.ts), [server](../../server.ts), [API response utility](../../src/shared/server/utils/ApiResponseUtils.ts), [client API wrapper](../../src/core/client/api/Api.ts) |
| Database migration + seeding | [DatabaseProvider](../../src/core/server/database/Database.Provider.ts), [migration registry](../../src/core/server/database/migrations/index.ts), [seeders](../../src/core/server/database/client/seeders/), [seed script](../../scripts/seed.ts), [analytics views](../../src/core/server/database/analytics/AnalyticsViews.ts) |
| Images + performance | [ProductImage](../../src/components/ProductImage.tsx), [Next configuration](../../next.config.mjs), [storage service](../../src/core/server/services/FileStorageService.ts), [fonts](../../src/fonts/), [providers](../../src/shared/client/providers/) |
| Customer AI | [CustomerAssistantService](../../src/core/server/services/CustomerAssistantService.ts), [action policy](../../src/shared/customer-assistant-policy.ts), [action execution](../../src/core/client/features/assistant/executeCustomerAction.ts), [Python graph](../../../agent-service/src/shop_agent/graphs/customer_assistant.py), [simulator](../../../agent-service/src/shop_agent/testing/simulator/customer.py) |
| Operations AI | [brand knowledge](../../../agent-service/data/knowledge/brand/), [market fixtures](../../../agent-service/data/market/), [analytics adapter](../../../agent-service/src/shop_agent/adapters/shop_db.py), [contracts](../../../../packages/contracts/), [agent service logic](../../src/core/server/services/agent/) |

Important coupling checks:

- Removing product sizes affects cart identity, order snapshots, assistant action cards, assistant read/write contracts, seed orders/returns and test fixtures. Do not remove a similarly named customer profile field by accident.
- Localized URLs affect auth redirects, assistant navigation allowlists, email links, SEO and analytics attribution. API routes and signed service requests remain locale-neutral.
- Inventory changes affect checkout, holds, cancellations, returns, buyback intake, pawn disposal, partner listings, agent promotions and SQL views. A new visible badge without server-side enforcement is incomplete.
- Payment and completion changes affect revenue reporting, conversion events, points and seller settlement. Count each actual economic event once.
- Expanded coupon types and member discounts must still obey existing applicable agent limits and confirmed business pricing policy. Do not bypass the old safeguards through a newly named voucher.
- Renaming does not authorize erasing persistent volumes, historical snapshots or customer data.

## 4. Phase progress record

Implementation started 2026-10-08. Evidence below is provisional; no phase is complete until its full acceptance gate passes.

| Phase | Status | Required evidence |
|---|---|---|
| 0 Baseline/policies | In progress | Instructions/policies read; source archive checksums and eight English operational documents; 23 web unit suites / 261 tests pass (176.433 s, sequential); agent baseline formatting failure; runtime performance baseline still being measured |
| 1 Brand/i18n/shell | In progress | Next-intl VI/EN routes, branded shell/home and lazy MorphSVG; initial type checks pass; responsive/locale/auth runtime verification pending |
| 2 Domain/media/seeds | In progress | Additive Gunpla columns, English/Vietnamese product descriptions, six synthetic model listings with local WebP; isolated PostgreSQL port 55433 model_universe_test seed exits 0; publisher rights review and AI contracts pending |
| 3 Store/purchase | In progress | Browse-to-purchase/return scenarios, totals/stock checks, screenshots |
| 4 Reservations | In progress | 16 deadline boundary tests pass (51.06 s); 8 PostgreSQL transaction/security/reminder scenarios pass (72.741 s); customer/staff workspaces and private evidence implemented; policy activation and full authenticated visual review pending |
| 5 Loyalty | In progress | Append-only points ledger, owned reward coupons, real stock gifts, historical claims and verified sales refunds; 23 rule/coupon tests pass (62.401 s), 8 database scenarios pass (69.975 s); owner policy approval and authenticated visual review pending |
| 6 Buyback/pawn | In progress | Buyback submission/inspection/revised quote/consent/verified payout/return agreement/source intake implemented; pawn workflow and financial activation decisions remain pending |
| 7 Marketplace | Not started | Seller isolation, moderation, guarantee and settlement reconciliation |
| 8 Discovery extras | Not started | Complete selected feature flows, no unsupported promises |
| 9 System quality | Not started | Agent regression/evals, accessibility, SEO, real performance results |
| 10 Cutover | Not started | Naming audit, migration/rollback rehearsal, release checklist |

Phase completion note template:

```text
Phase:
Implemented behavior:
Existing code reused:
New code and why it is necessary:
Changed files:
Schema/data migration and rollback compatibility:
Policy decisions applied / still open:
Tests run, exact outcomes, skipped prerequisites:
Desktop/mobile and VI/EN review evidence:
Performance measurements and conditions:
Remaining work / next bounded task:
```

## 5. Regression matrix

| Axis | Minimum cases |
|---|---|
| Identity | Guest, customer, partner A, partner B, admin; locked/suspended accounts |
| Locale | VI and EN deep links, sign-in redirects, switched filters/cart, emails, errors and assistant responses |
| Catalog | New multi-unit kit, unique used kit, missing parts, reserved stock, quarantined stock, archived item, accessory |
| Money | Exact boundaries, zero/negative/overpayment rejection, stale quote, duplicate callback/manual confirmation, refund and rounding |
| Lifecycle | Normal completion, cancellation, failure, retry, timeout, expiry, extension, dispute and reconciliation |
| Concurrency | Last-item buy vs hold, simultaneous top-ups, reward redemption, duplicate seller settlement, source intake replay |
| Persistence | Fresh seed, existing DB upgrade, restarted scheduler, partial migration failure, compatible application rollback |
| Devices | Narrow mobile, tablet, desktop; keyboard, zoom, reduced motion and network failure |
| Agent | Correct Gunpla attributes, exact stock/price grounding, locale, role isolation, approval controls and graceful outage |

Do not wait until the last phase to run this matrix for completed flows. Do not claim visual QA from source inspection or field Web Vitals from a single Lighthouse run.

## Implementation log — 2026-10-08

- Phase commits are authorized by the owner's explicit request. Phase 0 is recorded as `3f77b69` (English canonical policies, decision register, eight byte-identical source archives). Phase 1 stages the localized route shell, brand, motion, shared client contracts and modal accessibility together. Its isolated staged-tree frontend type check passes; the first staged check found missing client contracts, which were included before committing. Commit boundaries do not mark unfinished acceptance gates complete.
- Phase 1 is recorded as `41b1d98`. Phase 2 includes the concrete schema dependencies for the already implemented phase 3–6 workflows, so subsequent service commits never refer to absent tables. Its staged-tree server type check passes. A fresh isolated `model_universe_seed_test` seed completes with migrations through 20; unique preowned catalog items are excluded from synthetic repeated sales and bulk imports. Applied migrations 19 and 20 archive verified incorrect demo media and the original ASOS catalog without altering historical merchandise snapshots. Full catalog breadth and retained-database rehearsal remain outstanding.

- Retained database `web_ecommerce_ci_verify` was not reset or seeded. An independent local PostgreSQL cluster was created under ignored `.artifacts/`, with disposable `model_universe_test` at port 55433. Destructive seeds now reject database names without `_test` / `_demo`.
- Existing product stock means available-to-sell units. Keep that meaning for existing checkout; confirmed holds will decrement the same locked row, release it exactly once on cancellation, and transfer allocation to the existing order. No second stock counter is introduced.
- Source Vietnamese bytes were moved into English archive paths and checked with SHA-256. English operational documents preserve conflicts through D1–D11.
- Pending owner answers: pawn rate; rewards/stacking; partner fees/settlement. No response has been treated as approval. Remaining decision gates still apply.
- New catalog media includes custom painted models; unknown grade/scale remain unspecified. Demo photographs are reference images, never actual partner item evidence. Only publisher-verified media may pass final publication review.
- Full unit baseline: 23 suites / 261 tests pass in 176.433 s using `--runInBand`. The default parallel run exhausted memory and timed out; it was terminated. Initial application type-check passed; old Next generated route types were archived after locale route moves.
- Agent baseline `uv run poe check` stopped at an existing formatting issue in `tests/graphs/test_marketing_copy.py`; further checks remain.

- Added immutable approved commerce policies, reservation receipts/refunds/forfeiture ledger, allocation transfer to orders, private owned evidence, persisted 3-day/1-day reminders, and customer/staff reservation workspaces. Existing orders and original merchandise snapshots remain intact. Latest migrations are append-only through 2026-10-08-05.
- Reservation validation: 8 database scenarios passed in 72.741 s, including checkout versus the last held item, replay, cancellation allocation retention, shop-fault refunds, evidence ownership/signature validation, reminder dedupe and rejected raw SQL ledger mutations. The earlier 6-scenario run passed in 76.985 s.
- Playwright storefront smoke: 4 locale/device scenarios passed in 54.7 s, covering home, grade-filtered catalog, real product detail and public reservation information with page error and overflow checks. Full-page captures are under ignored `.artifacts/model-universe/visual/`; lazy image stabilization and remaining authenticated flows are still under review. No claim of complete visual acceptance yet.
- Customer AI planner now uses English source prompts, validated locale input and verified Gunpla identity/condition fields. It retains customer-scoped reads, editable proposals and all role/approval boundaries; no new financial writes are granted to the planner.

- Purchase verification: 4 authenticated desktop/mobile VI/EN Playwright cases passed in 42.9 s, proving live checkout, order snapshot, exact-request retry returning the same order, and pre-dispatch cancellation. The storefront suite also passed 4 cases after eager image stabilization. The first authenticated run reached confirmation but failed because the new test read `payload` instead of the existing API envelope's `data`; corrected without changing the API.
- Visual review of both checkout and confirmation identified a narrow desktop delivery form; moved delivery fields below the bag in the main column. API request locale and purchase/cart notifications now use locale resources; a follow-up visual run is required after these edits.
- Added source-backed loyalty rules, 12 proposed shared-table vouchers, tier qualification separate from redeemed balance, debt recovery, transaction-identity historical claim dedupe, real-SKU gift allocation and verified gift handover. No gift stock or fake receipts are seeded. Existing Coupon/Cart/Order validation is reused for owned single-use reward reservation, cancellation release and completion consumption. Financial activation still requires a staff-approved immutable policy; no preview or retained database approval was recorded.
- Added migrations 07–09 for the loyalty ledger/claims/gifts/redemptions, verified sales refunds and order benefit snapshots. Refund proposals at return intake do not alter points; only verified cumulative net merchandise payouts reverse points. Historical completed purchases are not automatically re-awarded during migration or refund processing.
- Agent regression now passes: 634 tests, 22 prerequisite-dependent tests deselected, 96.04% domain coverage in 279.96 seconds. Ruff formatting/lint, mypy (225 files) and all four architecture contracts pass. Tests explicitly enable growth capacity only in their isolated fixture; the committed demo concurrency setting remains zero.
- Added migrations 10–12 to protect issued reward terms, record gift configuration author/policy version and enforce 24 restrictive database foreign keys for commerce history. PostgreSQL membership regression passes 10 tests in 266.393 seconds, including cross-order concurrent refund reference reuse, reward term mutation and orphaned ledger rejection. This run predates the new COD confirmation boundary; its follow-up verification is pending.
- New order/reservation fulfillment now separates delivery from verified COD remittance. Migration 13 retains old settlement semantics for existing orders, adds an append-only receipt and requires explicit collection confirmation for newly created orders. Staff can verify the exact remaining balance with an actual receipt/remittance reference; browser confirmations and delivery statuses do not award points by themselves. Backend, localization and UI verification of this boundary are in progress.
- Development startup no longer performs a separate table-description pass when seeding is disabled. The dev command uses ts-node transpilation, with type checking retained as its explicit required gate; controlled startup/route measurements remain pending.
- COD/reservation/membership database verification after migration 13 passes 19 tests across two suites in 156.121 seconds. Delivery alone remains unpaid and earns no points; explicit verified collection is authenticated, amount-checked, deduplicated and append-only.
- Added migrations 14–16 and an end-to-end agreed support resolution workflow: model-specific reasons, private owned photographs, immutable offer/consent/completion events, real replacement/parts stock reserved at acceptance, repair handover, and verified partial/full merchandise refund or agreed compensation. A customer must accept the current offer version; accepted terms cannot be changed unilaterally. Existing return reasons, historical outcomes and the legacy 30-day window are retained; D8 is still unresolved.
- Support PostgreSQL regression passes 5 scenarios in 75.048 seconds: ownership/evidence, revised quote consent, replacement condition changes and stock replay, concurrent payout references for one case, and a physically received but unresolved claim that still blocks first point accrual. The first run failed because its fixture expected two multi-unit model SKUs; fixed the fixture to use a real unique preowned replacement rather than manufacturing duplicate stock.
- Latest application type-check passes; VI/EN resources have matching sets of 554 leaf keys. Browser review after COD/support changes and full unit regression are pending. No claim of phase 3–5 completion or production performance acceptance yet.

- Full web unit regression passed 25 suites / 297 tests in 177.852 seconds, sequentially. Frontend and server type checks passed after support and staff navigation changes. The initial lint run found a control-character regex in evidence filename sanitization; replaced it with character-code filtering. Follow-up lint exits 0 with existing warnings; no lint errors remain in that run.
- Verified COD-to-support browser flow passed all four VI/EN desktop/mobile cases in 2.3 minutes: staff delivery, actual remittance confirmation, customer private evidence upload, final resolution proposal, current-version consent, executed refund and completed customer history. The first run timed out on the test's exact nested-label selector; switched the select locator to its actual accessible combobox name. Screenshots exposed insufficient dark-modal contrast and a misleading pending intake badge on completed cases; subsequent contrast and independent resolution-state rendering updates need a follow-up capture.
- Migration 17 adds buyback requests, immutable custody/quote/consent events and an immutable verified payout ledger with restrictive history references. Staff can record preliminary appraisals, physical inspection, revised final offers and source-linked stock activation; customers accept the current inspected offer or agree to return delivery/cost terms. Intake requires verified ownership, a fresh archived zero-stock preowned SKU, the matching model code and three distinct actual-item shop uploads. No private customer evidence becomes a public listing automatically.
- Buyback browser submission/preliminary-appraisal review passed four VI/EN desktop/mobile cases in 1.6 minutes. The preview database retains zero approved commerce policies; inbound COD is not activated and no live financial rule was chosen. Only regression fixtures approve test policies in the disposable regression database.
- A shared bank-reference check now serializes actual transaction identity across reservation receipts/refunds, COD remittances, order refunds and buyback payouts before domain row locks. Existing domain ledgers remain separate. After this change, reservation/loyalty/support regression passed 24 tests; the accompanying first buyback run failed on an invalid fixture assembly code, not an accepted production request. Corrected it to the existing `painted` state. The next buyback run passed four scenarios and failed only because the duplicate-photo fixture reused a unique disk key; corrected the fixture to distinct disk keys with identical hashes. The final buyback run passed all five scenarios in 106.646 seconds.
- VI/EN application resources now have matching sets of 682 leaf keys. Staff navigation and account menu are localized; a locale switch was added to the actual staff header. Source archives and retained transactions remain unchanged. No production performance result or phase completion is claimed.

- Pawn migration 18, signed offer/consent/scans/custody, exact verified disbursement/redemption, explicit interest-stop snapshots, approved extensions, persisted due/overdue reminders and authorized disposal/intake are implemented. Nine pawn plus five buyback PostgreSQL scenarios passed in 320.604 seconds; reservation/loyalty/support follow-up passed 24 scenarios in 152.653 seconds. Frontend and server type checks pass after these changes.
- Pawn/buyback browser follow-up passed eight VI/EN desktop/mobile cases in 2.9 minutes. The pawn preview quote is correctly blocked before financial-policy approval; migration 18 is applied and preview approved-policy count remains zero. This is not a live financial activation or full contract browser acceptance claim.
- D6 now records the unresolved verified-repayment versus physical-handback interest-stop conflict and post-disposal debt/sale-proceeds reconciliation. Owner questions were sent; independent work continues. Disposal and inventory intake do not silently forgive debt or record sale proceeds.
- Publisher pages confirmed seven Flickr CC BY 2.0 licenses and corrected creator credits. They also proved the original Unicorn image depicts a human-sized statue, not a plastic kit. Three publisher-verified CC BY-SA 2.0 Unicorn NT-D reference photographs replace that seed listing; original images/order snapshots remain retained. Active incorrect demo listings must be archived through an additive migration, never relabeled in historical transactions.

- Full signed pawn browser workflow passed all four VI/EN desktop/mobile cases in 1.6 minutes on a separate `model_universe_browser_test` copy: quote, exact consent, private signed-scan fixture, both-signature verification, physical custody tag, actual principal confirmation, exact redemption, distinct actual handback, zero sellable pledged inventory and completed timeline. The initial run began before the restarted HTTP server was ready (three connection-refused cases, one pass); the readiness check was confirmed before this passing rerun. Its fixture-only policy is not applied to the preview or retained database.
