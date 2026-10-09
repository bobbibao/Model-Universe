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

- [x] Web unit and PostgreSQL regression: 61 suites / 514 tests pass in 618.604 seconds; rerun affected suites after subsequent changes.
- [x] Frontend/server type checks, lint and production build pass for the current UI/runtime change; existing lint warnings remain.
- [ ] Public, customer, seller and staff browser flows in VI/EN on mobile and desktop.
- [ ] Publication, marketplace shipping/payment/fulfillment, disputes, settlement, guarantee reconciliation and purchase-backed seller ratings implemented and verified.
- [ ] Pawn post-disposal principal/interest/cost/surplus reconciliation implemented under explicit contractual approval.
- [ ] Development startup, first route and HMR measurements; production transferred JS/media and lab navigation evidence.
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
