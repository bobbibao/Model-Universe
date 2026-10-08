# Model Universe: full-platform refactor plan

Date: 2026-10-08. Status: implementation-ready planning baseline, with explicit business decisions still open. Intended implementer: GPT 6.1-sol, as requested by the owner. This document does not assert that the proposed functionality already exists.

## 1. Outcome and scope

Transform the current clothing commerce platform into **Model Universe**, a professional Gundam/Gunpla shop supporting new and secondhand sales, deposits and reservations, buyback, pawn contracts, loyalty, and a moderated partner marketplace. Deliver a distinctive futuristic storefront, usable customer/partner/admin workspaces, English source code and documentation, Vietnamese and English experiences, and measurable performance in both development and production.

This is a staged refactor of the existing system, not a replacement application. Preserve working commerce, security, agent controls, and historical records. New code must implement a specified requirement with a real caller, persistence where needed, and verification; do not invent existing APIs, packages, integrations, or business facts.

Read alongside:

- [Business requirements and unresolved decisions](./business-requirements.md).
- [Experience design, competitor references, and media plan](./experience-design.md).
- [Implementation handoff and phase checklist](./implementation-handoff.md).

Planning assumption pending the owner's response: Vietnam-first operations, VND settlement, Asia/Ho_Chi_Minh business time, both `vi` and `en` at launch. English UI does not imply international shipping, foreign-currency settlement, or translated user evidence.

## 2. Verified repository baseline

The evidence below was inspected, not inferred from an imaginary target architecture. No application runtime, performance benchmark, database migration, or test suite was run during this planning task.

| Area | Existing evidence | Consequence |
|---|---|---|
| Runtime | [package.json](../../package.json), [server.ts](../../server.ts): Next.js 14, React 18, Express custom server, TypeScript, Yarn 4 | Keep the stack first; assess a supported Next/React upgrade separately after compatibility checks. |
| Development | [next.config.mjs](../../next.config.mjs): Turbopack development directory and Webpack fallback; development script already enables Turbopack | Measure actual behavior before proposing a new bundler or claiming the flag alone solves latency. |
| Architecture | [project overview](../PROJECT_OVERVIEW.md), [API router](../../apiRouter.ts): decorator controllers, services directly using Sequelize, PostgreSQL, Umzug migrations | Extend existing patterns. No repository layer, generic workflow engine, or new backend framework. |
| Catalog | [Product model](../../src/core/server/database/client/models/Product.Model.ts): apparel gender and sizes, product-level stock; [order lines](../../src/core/server/database/client/models/OrderItem.Model.ts) snapshot size | Domain changes must cover catalog, cart, checkout, admin, agent tools, tests, and analytics together. |
| Checkout | [Order model](../../src/core/server/database/client/models/Order.Model.ts), [Order service](../../src/core/server/services/OrderService.ts): COD, four lifecycle states | Payment collection, reservation, shipment, and completion must become explicit without breaking legacy orders. |
| Seeds/media | [Product seeder](../../src/core/server/database/client/seeders/Product.Seeder.ts), [catalog JSON](../../src/core/server/database/client/seeders/data/products.json): apparel, USD conversion, ASOS URLs; [ProductImage](../../src/components/ProductImage.tsx) | Replace the catalog and image delivery together, including all derived scenarios. |
| Presentation | [root layout](../../src/app/layout.tsx), [store layout](../../src/components/Layouts/StoreLayout.tsx), [home](../../src/core/client/features/home/pages/Home.tsx), [hero](../../src/core/client/features/home/components/Hero.tsx) are client components; global customer/agent providers | Narrow client boundaries and defer assistant work. A client layout alone does not prove all content is client-only; inspect rendered HTML and requests. |
| Localization | [page metadata](../../src/app/page.tsx), [middleware](../../src/middleware.ts), API messages and UI contain Vietnamese literals; root language is hardcoded | Introduce locale-aware routing and stable message codes across web and server. |
| AI | [customer assistant graph](../../../agent-service/src/shop_agent/graphs/customer_assistant.py), [assistant service](../../src/core/server/services/CustomerAssistantService.ts), [brand guide](../../../agent-service/data/knowledge/brand/brand_guide.md) contain apparel assumptions | Retarget existing agents, contracts, knowledge and evaluations, not just homepage copy. |
| Quality | [web tests](../../tests/), [browser tests](../../e2e/), [agent tests](../../../agent-service/tests/), [contracts](../../../../packages/contracts/), [gate script](../../../../scripts/gate.py) exist | Reuse test infrastructure and preserve its meaningful coverage. |

The overview contains stale statements: it mentions a 500 ms root loader that is not present in the inspected root layout, and prohibits i18n libraries despite this new explicit multilingual request. Verify current code; record this request as the reason for superseding conflicting legacy guidance. Do not treat all historical documentation as current behavior.

## 3. Boundaries that prevent overengineering

1. Keep one web commerce process and the existing Python agent service. No new microservices, Kafka, Kubernetes, GraphQL, CMS, search cluster, or generic event-sourcing platform for this refactor.
2. Keep direct service-to-Sequelize access, current controller conventions, shared validation utilities, React Context for the state that already needs it, and Tailwind. Add no replacement ORM or global state library without a measured need.
3. Use explicit domain statuses and transaction functions. Financial and point histories are append-only domain records, not an excuse to event-source the whole application.
4. Add a small module only when its phase implements a complete customer/admin flow. No empty services, speculative interfaces, placeholder routes, fake checkout success, or buttons with no operation.
5. Prefer CSS for ordinary motion. Use one lazy-loaded GSAP/MorphSVG treatment and a small Lottie animation only where specified in the experience brief; verify package APIs and asset licenses first.
6. Reuse existing tables, services and UI controls when their semantics fit. Avoid blind global renames: customer gender is unrelated to obsolete product gender, and archived order snapshots are not catalog seed data.
7. Implement documented commerce requirements before optional growth features. The final full-scope release includes all required domains; an intermediate storefront release is not completion of this plan.

## 4. Target code organization and naming

Public brand: `Model Universe`. Repository slug and eventual checkout directory: `model-universe`. Web package: `@model-universe/web`; Python distribution/CLI branding: `model-universe-agent`. Keep descriptive, already-English directories such as `apps/web-ecommerce`, `apps/agent-service`, and `packages/contracts`; renaming them only for appearance adds churn without improving the domain. The internal `shop_agent` import namespace may remain as a neutral implementation name; do not leave old clothing branding in user-facing or package descriptions.

Continue the current structure:

- Thin Next route files and feature-scoped UI under the existing [client features](../../src/core/client/features/).
- Controllers under [API controllers](../../src/app/api/) and business logic under [services](../../src/core/server/services/).
- Explicit models and migrations in the existing [database area](../../src/core/server/database/).
- Reusable UI under [components](../../src/components/); shared types and formatters under [shared](../../src/shared/).

Proposed additions, not existing paths: `src/i18n/`, `src/messages/en/`, `src/messages/vi/`; feature folders `reservations`, `buyback`, `pawn`, `loyalty`, `partner`; only the server counterparts required by those features. Preserve API prefixes while adding localized page routes.

Use English file/folder names, identifiers, enum values, comments, developer documentation, logs, canonical editorial copy, and test descriptions. Vietnamese belongs in `vi` resources, Vietnamese catalog translations, Vietnamese agent/customer output, and original user evidence. This is the necessary exception for a genuinely bilingual product.

Translate the supplied business documents into canonical English documents with English paths during phase 0. Preserve original evidence in an English-named `business/source/vi/` archive, with a source-to-target map and no silent changes to disputed formulas. This planning task leaves the original documents intact.

Rename checklist for the implementation phase:

- Brand component, metadata, favicon, manifest if introduced, logo assets, emails, exported documents, policies, assistant introduction, seed administrator label, footer and social previews.
- Root/app READMEs, package metadata/lockfiles, Python build metadata/entry points, Docker service display names/image tags, scripts and actual CI references. Discover references before changing them.
- Rename the GitHub repository and remote URL as a coordinated final operation when implementing the authorized rename; verify redirects, automation and clone instructions. Move the active checkout only after processes are stopped and workspace references are updated.
- Do not rename/delete Postgres data directories or Docker volumes as a cosmetic operation. Record persistent-resource mappings and migrate explicitly if needed.
- Migrate browser storage keys once with a version, preserving guest carts when valid; invalidate obsolete apparel-only selections with an understandable message.

## 5. Domain and data strategy

### Catalog and inventory

Extend the current Product model with explicit Gunpla attributes: manufacturer, grade, scale, series/universe, model code, edition, condition (`NEW`/`PREOWNED`), assembly status, box condition, included accessories, missing parts, defects/repairs/customization, and availability. Allow not-applicable values for tools and accessories; do not invent a grade or scale.

Keep one product row per sellable SKU/condition/seller offering in the first implementation. A unique used model has quantity one and its own evidence photos. Identical new kits can share quantity stock. Do not introduce a generic product/variant/listing hierarchy unless a concrete flow proves it necessary. If grouping versions for comparison is needed, use a simple catalog grouping key first.

Add seller ownership and source provenance only when partner/buyback/pawn integration requires them. Preserve `inventoryStatus` quarantine and archival behavior separately from availability (`IN_STOCK`, `RESERVED`, `SOLD_OUT`, and later `PREORDER`). A held quantity must not hide all remaining stock for a multi-unit SKU.

Choose one stock accounting rule in phase 2 and update every writer consistently. Recommended: physical on-hand stock plus explicit active allocations; available-to-sell is their difference. Existing checkout currently decrements stock, so its transition, cancellation, returns, stock imports, and agent writes must change atomically with this convention. Do not subtract a reservation twice. Lock affected rows in deterministic order, and preserve no-overselling behavior.

Keep integer VND amounts. Use integer ratios/basis points for percentages and explicit rounding at boundaries; never compute financial eligibility from a rounded percentage shown in the UI. Use UTC instants and Asia/Ho_Chi_Minh business dates. Snapshot price, discounts, policy version, condition, seller and collectible identity at transaction time.

### Required additions

| Domain | Extend existing | Add only when implementing |
|---|---|---|
| Sales and deposits | Order, OrderItem, CartService, OrderService, stock locks | Reservation record, confirmed payment transactions, extensions and status history |
| Buyback | Upload/storage, stock imports, product admin | Request, inspection/quote revisions, customer acceptance and payout evidence |
| Pawn | Customer, upload and inventory controls | Asset custody, contract, disbursement/redemption payments, extensions and status history |
| Loyalty | User/account, Coupon, coupon validation | Point account/ledger, reward catalog/redemptions, historical transaction claims |
| Marketplace | Product, OrderItem, returns, customer auth | Partner profile, moderation, guarantee ledger, seller fulfillment, fee/settlement/dispute records |
| Notifications | MailService and existing notifications where appropriate | Customer inbox/reminder delivery records with unique event keys |

Do not create parallel order/customer tables just because an informal source document uses plural example names. Reuse the existing identity and order references.

### Migration and seed safety

- Append Umzug migrations; never rewrite applied migrations. Define all new fields on models and register models/relations in dependency order.
- Use expand -> backfill -> switch readers/writers -> verify -> contract. Retain old apparel columns until web, agent, analytics and test consumers no longer read them.
- Demo reset and production migration are different operations. Current `seed-dev`, `seed-prod` and `seed-ci` set destructive flags; do not use them against retained data. Add explicit disposable-database checks before normalizing seed commands.
- Preserve historical sales, returns, customer balances, payment evidence and audit trails. Archive old catalog listings in retained environments; do not turn an old shoe order into a Gundam order.
- Supply deterministic `minimal`, `demo`, and `test` seed profiles using the existing seed clock/seed. Suggested targets: 12 representative products for fast development; approximately 60 curated Gundam/related products for demo; boundary fixtures for tests. Counts are proposed, not claims about available licensed media.
- Replace categories, suppliers, reviews, orders, return reasons, inventory, coupons, market fixtures, agent simulations, brand knowledge and campaign examples with coherent Gundam scenarios. Use exact model facts verified from sources and explicitly synthetic prices/history; never present fabricated demo reviews or market signals as real endorsements.
- Seed real operational edge cases: unique preowned item, missing accessory disclosure, same kit from two sellers, partial deposit, COD remainder, expired hold, active pawn, point reversal/debt, suspended seller, frozen settlement.
- Reseeding is deterministic and repeatable on disposable databases. Production reference-data insertion is idempotent and never reissues money, points or stock.

## 6. Bilingual architecture

Use `next-intl` as the proposed single localization library after checking compatibility with the installed/target Next release. The explicit multilingual requirement supersedes the old overview's blanket prohibition. Avoid maintaining a second homemade translation framework.

- Public pages use `/vi/...` and `/en/...`; default `/` redirects to the remembered locale, then `vi`. URL is authoritative; switch language while preserving resource, search/filter state and safe return URL.
- Localize customer, partner and admin experiences, validation, empty/error states, notifications, email, policy pages, metadata and assistant responses. Keep identifiers and API paths English and locale-neutral.
- Prefer English-stable product slugs initially to avoid duplicate routing complexity. Support English and Vietnamese product descriptions/search aliases; proper model names and manufacturer codes remain exact.
- Use namespace-scoped dictionaries (`common`, `catalog`, `checkout`, `account`, `reservations`, `buyback`, `pawn`, `loyalty`, `partner`, `admin`). Check matching keys and interpolation variables in CI; no runtime machine translation on the critical path.
- Add a small product-translation relation keyed by product and locale if editorial content must be managed in both languages. Do not duplicate the entire catalog per locale. Define English fallback and flag missing Vietnamese editorial content for review.
- API errors expose stable codes plus parameters. Client translates codes; server-rendered messages/email use the same approved message semantics. Migrate the current envelope incrementally without breaking the machine-to-machine Agent API.
- Compose locale resolution and the existing auth middleware; do not replace auth checks. Express `/api`, `/uploads`, Next assets and service-token routes bypass page-locale redirects. Test encoded paths, deep links and sign-in return URLs in both locales.
- A server root layout sets `lang`; small client providers handle interaction. With the current custom Express server, test SSR data access and cookies deliberately; do not assume Next route handlers or server actions replace the existing API transport.
- Use `Intl.NumberFormat`/`Intl.DateTimeFormat`. Currency remains VND in both locales; payment/deadline calculations remain identical. Add locale-specific canonical links, hreflang, sitemap entries and product metadata.
- Store a user's preferred locale for transactional communications. Pass locale explicitly into agent requests and localized action labels; do not infer it from a translated product name.

## 7. Performance and development experience

Capture baseline on the actual Windows machine before setting final budgets. No claim of existing compliance is made. Development necessarily compiles new/changed code; the goal is fast feedback and smooth warm navigation, not a promise of zero compilation.

| Measurement | Proposed acceptance target | Method |
|---|---|---|
| Production Core Web Vitals | LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 at p75 | Prelaunch lab proxy plus field monitoring after enough real traffic; label them separately |
| Public first-route JS | <= 180 KiB compressed, including shared app chunks | Analyze actual transferred executable JS; no admin charts, agent SDK or animation runtime on initial catalog render |
| Initial mobile media | <= 800 KiB on the chosen home viewport; hero <= 250 KiB | Responsive image network capture; do not download all gallery assets |
| Catalog API | p95 <= 300 ms on warm representative database | Record data volume, queries, concurrency and machine; index observed bottlenecks |
| Dev ready | Target <= 15 s with local DB ready | Three runs; separate process startup, Next preparation and DB initialization |
| First dev route | Target <= 3 s after ready | Cold-route load measured separately from hot navigation; adjust only with recorded evidence |
| Warm route navigation | Target <= 500 ms to useful UI on local stack | Home -> catalog -> product -> cart; do not hide actual latency behind arbitrary loaders |
| HMR | Target <= 1 s for representative component edit | Five edits, record median/p95 and browser update time |

Work in this order:

1. Measure root/provider requests, route imports, compile timings, initial HTML, images, database startup/migrations and fonts. The database provider imports seeders through models; profile this dependency path rather than assuming its cost.
2. Render catalog/content HTML on the server with narrowly scoped client islands. Reuse service business logic without pulling server/ORM code into browser bundles. Keep authenticated prices, account data and carts private and uncached.
3. Move account/cart providers to their relevant shell; load assistant panel and SDK when opened. Isolate admin charts and marketing SDKs from storefront imports; verify the resulting graph.
4. Use responsive self-hosted images or a proven image CDN, dimensions/aspect ratios, AVIF/WebP variants, lazy galleries and one prioritized LCP image. Keep development from repeatedly optimizing large originals.
5. Consolidate Vietnamese-capable WOFF2 font subsets and weights. Avoid loading the existing directory's many formats/weights wholesale.
6. Start normal dev without data reset, network asset downloads, agent boot or heavyweight fixtures. Preserve the current Turbopack/Webpack fallback until measured compatibility is established. Do not add a second dev server just to hide a problem.
7. Cache public reference/catalog reads with explicit invalidation for price, stock and moderation. Checkout always revalidates from the database. Profile search before considering PostgreSQL text/trigram indexes; no external search service initially.
8. Schedule due work durably and idempotently with a small DB-backed job/notification mechanism and an existing deployment scheduler or an explicit worker command. In-process timers alone cannot safely manage money-related expiry across restarts or replicas.

## 8. Delivery phases and acceptance gates

Every phase includes frontend, backend, data, localization and appropriate checks for its scope. Keep the application runnable between phases. Phase numbers define dependency order, not invented time estimates.

| Phase | Work | Gate / reviewable result |
|---|---|---|
| 0. Baseline and policy map | Inventory routes/assets/strings/contracts; translate source policies; record decisions, screenshots and performance baseline; establish disposable test DB | Current tests recorded, source-to-requirement map complete, unresolved money rules visible, no data reset |
| 1. Brand, shell and locale foundation | Model Universe tokens/logo/type; locale routing and message codes; server/client boundaries; prototype home + catalog + PDP in both locales using actual data | Responsive design direction demonstrated, keyboard/reduced-motion checks, auth still works, no blanket folder rewrite |
| 2. Gundam domain and media | Schema expansion, Gunpla filters/condition, product admin, inventory accounting, licensed media manifest, deterministic seed replacement, agent read contract updates | Old DB upgrade and fresh DB tested; exact media mapping; no apparel attributes in new catalog/cart/assistant flow |
| 3. Storefront and core purchase | Finish home/search/PLP/PDP, compare, wishlist, checkout, delivery choices, order tracking, returns and account UX; deploy payment-record foundation | Real browse -> checkout -> delivery/return journey; accurate totals/stock; both locales; fast dev/production measurements |
| 4. Deposits and reservations | Hold pricing/timer, top-ups, payment confirmation, extensions, reminder jobs, COD remainder, pickup and fulfillment handoff | All reservation source tests including sections 35-50; concurrency/retry/expiry tests; complete customer/admin UI |
| 5. Loyalty | Point ledger, tiers, reward vouchers/gifts, claim verification, refund debt, promo selection | No duplicate earn/redeem; full and partial refund checks; tier preserved on redemption; chosen reward configuration versioned |
| 6. Buyback and pawn | Intake/evidence, quote revisions/acceptance, inspection, payout/custody/contracts, capped interest, redemption/extension/disposal | Buyback cannot list before ownership transfer; pawn cannot sell before authorized disposal; policy decisions resolved before live activation |
| 7. Partner marketplace | Partner onboarding/verification/limits, listing moderation, seller workspace, guarantees, seller fulfillment, disputes and settlement | Seller A cannot read/write seller B; buyer sees seller and condition; split fulfillment reconciles; disputes freeze correct payout |
| 8. Discovery and engagement | Restock alerts, releases/preorders once policy exists, kit-finder/compatibility, seller follow, guides and selected loyalty bonuses | Every surfaced action has an implemented backend and honest stock/ETA; preferences and notification deduplication work |
| 9. Full agent and operations alignment | Finish Gundam knowledge/evals, locale-aware tools, role-scoped capabilities, operational dashboards, search/SEO/accessibility/performance hardening | Web/agent contract suites pass; no unauthorized money/pawn actions; regression matrix and real measurements attached |
| 10. Cutover and rename | Final English naming/content audit, data rehearsal, repo/package rename, deployment/runbook and rollback rehearsal | Full required business coverage accepted, all launch gates pass, real environment configured; no silent optional-feature stubs |

Agent compatibility is updated in each relevant phase, especially phase 2; phase 9 is a final system check, not permission to leave the agent broken until the end.

### Additional features: priority, not uncontrolled scope

Required by supplied policies: reservations/COD remainder, buyback, pawn, loyalty/history claims, marketplace trust/guarantees/disputes/settlement, evidence-aware support.

Recommended first additions: grade/scale/series filters, transparent condition reports, compare up to three kits, guided beginner kit finder, wishlist and restock alerts, available payment/shipping breakdown, seller storefronts, reusable address book, operational inbox and order timeline.

Later, explicitly optional: release calendar/preorders with allocation/ETA/refund rules, build guides, seller following, referral campaigns with anti-abuse limits, personal collection, auctions and algorithmic price suggestions. A simple buyback followed by a separate purchase can serve an assisted trade request; do not invent a netted trade-credit wallet until trade accounting is specified. Auctions and social/community features do not block completion of the documented core business scope.

## 9. Verification and release definition

Reuse scripts already defined in [package.json](../../package.json): `yarn type-check`, `yarn lint`, `yarn test`, `yarn test:db`, `yarn test-vectors`, `yarn build`, `yarn e2e`. Inspect their current prerequisites first; DB/browser suites need the documented test stack. Use `uv run poe check` and relevant existing agent evaluations after checking [Python task configuration](../../../agent-service/pyproject.toml). If framework upgrades remove a command, replace its script deliberately and document the new invocation.

Add meaningful behavioral coverage for money calculations, concurrent inventory allocation, payment replay, policy boundaries, role isolation, refunds/points, migrations and bilingual routing. Do not add tests that merely mirror static copy or component implementation. Use visual review at 360/390, 768, 1440 and 1920 px, both locales, reduced motion, loading/error/empty states and keyboard navigation. Check every main customer, seller and staff workflow, not only homepage screenshots.

Release requires:

- No old clothing content in active catalog, new seeds, promotional UI, assistant knowledge or media. Historical records and original source archives remain truthful.
- All required domains have persisted, permission-checked end-to-end flows. No `TODO` transactions or simulated live payments.
- Reconciled stock, cash/COD collections, deposits, pawn balances, loyalty and partner settlements under retries and failures.
- Image provenance and condition evidence verified; no wrong kit/version photos, broken assets or competitor hotlinks.
- Complete VI/EN experience and English engineering artifacts, with documented exceptions for localized content/evidence.
- Accessibility review and measured production/development budgets, or a specific accepted exception with evidence.
- Upgrade and rollback rehearsal on a retained-data copy. Rollback does not erase confirmed financial events; additive schema and transaction compatibility are retained until safe contraction.

The current untracked owner business documents and unrelated environment backup are outside the planning edit scope and must remain untouched.
