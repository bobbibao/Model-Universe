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

All implementation phases are **not started** as of this planning deliverable. Update the table during implementation, using evidence rather than percentages.

| Phase | Status | Required evidence |
|---|---|---|
| 0 Baseline/policies | Not started | Inventory, source translations, decisions, test/performance baseline |
| 1 Brand/i18n/shell | Not started | Bilingual responsive thin slice, auth checks, rendering/network trace |
| 2 Domain/media/seeds | Not started | Migration and seed reports, media manifest, catalog and agent contract checks |
| 3 Store/purchase | Not started | Browse-to-purchase/return scenarios, totals/stock checks, screenshots |
| 4 Reservations | Not started | Source tests 1–15 plus concurrency/expiry/retry evidence |
| 5 Loyalty | Not started | Source tests 1–10 plus reversal/debt/redemption checks |
| 6 Buyback/pawn | Not started | Accepted policy decisions, custody/payout/interest/ownership tests |
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
