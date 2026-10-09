# Model Universe release verification

This is the release evidence register. An implemented phase is not a production approval. Each gate requires actual results for the current commit.

## Runtime compatibility

The implementation upgrades the unsupported Next.js 14 baseline to patched Next.js 15.5.27, React 19.3.0 and matching React types. The dependency audit additionally requires patched next-intl 4.14.9 and Nodemailer 10.0.16. Locale navigation uses the documented createNavigation API; the existing VI/EN request configuration and Express architecture are retained. Async route parameters and explicit React ref initializers are migrated without replacing the Express server or Sequelize architecture.

Primary sources: [Next support policy](https://nextjs.org/support-policy), [September 2026 security release](https://nextjs.org/blog/september-2026-security-release), [Next 15 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-15).

The framework root is the actual repository, not a lockfile in the user's home directory. Development and browser builds use independent compilation directories. The production build succeeds; final regression and measured payload budgets are still pending. An ApexCharts peer mismatch remains subject to actual dashboard browser verification. The first full web regression passed 504/510 tests across 57/59 suites in 792.873 seconds. Six failures exposed a marketing fixture that incorrectly selected the last migration and a five-second migration replay timeout. The corrected marketing suite passes all five scenarios; migration replay/upgrade and collectible integrity pass all eight scenarios in 46.042 seconds. The full suite was not rerun unchanged; the repaired files were rerun explicitly.

## Retained-data upgrade rehearsal

On 2026-10-09, a new disposable database named model_universe_upgrade_oct09_test was copied from the existing model_universe_browser_test database at migration 19. The actual migration command applied migrations 20–26. No source database was reset or reseeded.

Before/after row counts and SHA-256 fingerprints match for all 14 selected historical tables: order (317), order_item (374), order_receipt (6), order_refund (4), reservation (0), reservation_payment (0), reservation_event (0), loyalty_ledger (0), buyback_request (8), buyback_payout (0), buyback_event (16), pawn_contract (9), pawn_payment (10), pawn_event (49). Ignored evidence files: .artifacts/model-universe/upgrade-before.json and upgrade-after.json.

A second migration invocation exits successfully. Compatible application rollback and another fingerprint comparison after replay are still pending; successful schema migration alone does not prove rollback compatibility.

## Launch gates

- [x] Web unit and PostgreSQL regression: 62 suites / 516 tests pass in 434.450 seconds after Faker/UUID changes; 4 focused suites / 15 tests pass in 10.517 seconds after the CommonJS loader correction. Rerun the full suite after further changes.
- [x] Frontend/server type checks, lint and production build pass for the current UI/runtime change; existing lint warnings remain.
- [ ] Public, customer, seller and staff browser flows in VI/EN on mobile and desktop.
- [ ] Publication, marketplace shipping/payment/fulfillment, disputes, settlement, guarantee reconciliation and purchase-backed seller ratings implemented and verified.
- [ ] Pawn post-disposal principal/interest/cost/surplus reconciliation implemented under explicit contractual approval.
- [x] Development startup, first route and HMR measurements; production transferred JS/media and lab navigation evidence recorded.
- [ ] Development cold-page and warm-navigation performance budgets met.
- [ ] Keyboard, reduced-motion, localization, private-data, SEO and responsive checks.
- [ ] AI server authentication/roles and approval controls; configured live-model and Redis recovery prerequisites verified separately.
- [ ] Owner-approved financial policy versions and verified contact, payout, warehouse, domain and media-rights facts.
- [ ] Dependency audit and runtime security review resolved.
- [x] Paired Docker database/public/private-file backup and restore on an isolated release fixture; selected historical fingerprints and private bytes match.
- [ ] Compatible application rollback and final persistent-resource mapping verified.
- [ ] Final naming audit, coordinated repository/checkout rename and release handoff.

Keep unresolved D1–D11 decisions in the business decision register. Fixture approvals in disposable test databases are not owner approvals, actual receipts or permission to activate production transactions.

## Deployment evidence storage

The Docker context now excludes .private-uploads, browser tooling output and TypeScript caches. The non-root runtime creates its private evidence directory with node ownership. Compose mounts a separate private-evidence volume at /app/.private-uploads; it remains outside public/ and the /uploads HTTP mount. Existing dbdata, uploads and ollama volume identities remain unchanged. Backups include the database, public uploads and private evidence together; a database-only restore cannot recover scanned contracts or identity evidence. Container persistence/private delivery and a paired restore rehearsal pass on isolated fixtures. See [deployment and recovery](./deployment-runbook.md) for the exercised image, resource identities and remaining application rollback gate.

## Paired backup/restore rehearsal — 2026-10-09

The owned release web container was stopped while PostgreSQL custom-format dump and matching public/private directories were copied to a new ignored backup set. The source container then restarted unchanged. Restore used a new `model_universe_restore_20261009_test` database and `model-universe-release-restored-evidence` volume; no source data or existing project volume was overwritten.

Eleven selected table fingerprints match, including 871 synthetic orders, 871 lines and one evidence record. The restored runtime authenticates its fixture owner and serves the identical private-file SHA-256 with HTTP 200; guest delivery returns 401. The exercised image is `sha256:a568d0600be5774aec165aa545bd352368b0044f7ba0e8d612aa172a6eaf04fa`, preceding the final dependency/loader refresh. The procedure confirms backup recovery for that image; it does not establish compatibility with an older application or close business/production gates.

## Latest focused verification

SWC 1.16.2 is the compatible Windows compiler pin; loader checks and OS permissions remain unchanged. Startup validation now uses effective environment configuration, and database connection/model initialization failures reject server startup. Thirteen focused startup/SSR scenarios pass in 11.131 seconds. Four actual production Chrome route cases pass for VI/EN desktop/mobile with actual dashboard charts, SSR product titles, role redirects and public seller privacy. Full financial flows and remaining launch gates remain unchecked. The recovered disposable PostgreSQL cluster now listens on 55434.

Production UI regression: four VI/EN mobile/desktop route/keyboard cases pass after restoring native table semantics. Verified COD/support resolution passes four cases in 1.3 minutes; a VI-only duplicate-text test locator is repaired without dropping financial/event assertions. Docker evidence probe verifies UID 1000 ownership, authenticated private reads, 401 guest access, 404 direct disk URL and exact-byte persistence after restart on a separate disposable release database. The test image is not deployed as production.

## Measured runtime and payload follow-up — 2026-10-09

Faker 10.6.0 and UUID 11.1.1 remove their recorded dependency advisories. Node requires ^22.13.0 or >=24.0.0. The server compiler uses Node20 module semantics; actual CommonJS controllers/services use require at their existing module boundary. This avoids native dynamic-import failures on Windows drive paths and extensionless services. Route initialization is awaited before database initialization/listening, and a missing controller fails startup. The focused loader/startup/SSR regression passes 15 tests; the current full production build, lint and frontend/server compilation pass.

Removed unused promise tracking (no subscribers exist) and the external Inter font import (the actual UI uses self-hosted Satoshi). Twelve real Chrome cases pass in 2.1 minutes after these changes: owned checkout/replay/cancellation, real search/error recovery/stale-response isolation, and verified COD/accepted support payout across VI/EN × mobile/desktop.

Production measurements use installed Chrome, local network, no CPU/network throttling, fresh browser cache for each of 12 home/shop/product route/device/locale combinations and three seconds after load. Compressed executable JavaScript is 177.5–179.9 KiB; mobile home images transfer 208.6 KiB. Lab LCP is 216–1184 ms, maximum CLS 0.007272, with no page errors/overflow. Thirty sequential warm catalog reads on this nine-product fixture yield median 18.025 ms and p95 32.997 ms. These are small local-fixture measurements, not field INP/Web Vitals or peak-load evidence. The previous run exposed approximately ten-second loads waiting for the unused external font; removing it eliminated those observed slow resources.

Development uses the actual custom server/Turbopack on Windows, an isolated retained disk cache, three readiness runs and real Chrome route/link navigation. Ready: 9918.760 / 9070.962 / 9322.512 ms. First home heading: 12921.614 ms. Warm shop/product link navigation: 1114.581 / 1520.694 ms. Five HMR edits after the actual Search subscription: 813.877–863.226 ms. Readiness/HMR targets pass; the first-page three-second and warm-navigation 500-ms targets remain unmet. Failed measurement attempts are retained, and temporary probe attributes were removed without overwriting other source changes. Scripts and raw results are under scripts/measure-development.cjs, scripts/measure-storefront.cjs and ignored .artifacts/model-universe/{development,production}-metrics.json.

Security gate remains open: braces 3.0.3 (one high advisory, no published patch), sprintf-js 1.0.3 (one moderate advisory, no published patch) and stream-json 1.9.1 (three moderate advisories through the Google Ads SDK). A forced stream-json 3.x resolution would break the SDK’s actual CommonJS imports; no incompatible resolution or owner risk acceptance is invented. Deprecation notices are recorded separately from vulnerabilities.

Current-image Docker follow-up passes after Faker/UUID, module-loader and payload changes: sha256:e36b32312289777645a2701079c97472440b59904253658fb0f7e7677da5027f. It starts against the existing release fixture database/private volume with seed/drop disabled, serves VI/EN/catalog HTTP 200, runs at UID 1000 and serves the unchanged private SHA-256 to the authenticated owner (200) while guests receive 401. The preceding image remains available. This validates the refreshed Linux runtime without resetting fixture history; it is not a production deployment or older-application rollback proof.
