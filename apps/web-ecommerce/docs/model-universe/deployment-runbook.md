# Model Universe deployment and recovery

This runbook covers the existing Express/Next application and PostgreSQL/storage layout. It does not authorize deployment or claim that outstanding business and release gates have passed. Follow [release verification](./release-verification.md) for current evidence and [the decision register](./business-requirements.md#9-decision-register) for financial activation.

## Runtime and resource identity

- Use Node 22.13 or newer in the supported 22 line, or Node 24 or newer. Build with the committed Yarn lockfile; do not copy a developer `.env` into an image.
- The web image runs as `node`. `/app/uploads` holds public merchandise media; `/app/.private-uploads` holds private evidence and is never a public HTTP mount. Back up both with the database.
- Production startup requires a strong session secret and successful controller registration/database initialization. `SEED_DATA=false` and `DROP_TABLES=false` are retained-environment settings. Financial policies are append-only approved versions, not deployment defaults.
- The current Compose project identity is `shop-agent`; its logical volumes are `dbdata`, `uploads`, `private-evidence` and `ollama`. The existing web database identity is `web_ecommerce`, and the agent database is `shop_agent`. Preserve their actual physical identities when changing branding. A new Compose project name without explicit volume mapping can attach empty volumes.
- Record the actual image digest, database names, volume names, domain/TLS configuration and secret references in the deployment inventory. Never publish credentials in release evidence or Git.

## Consistent backup

1. Stop new requests and pause workers that can write through the web API. Stop the identified web process/container and confirm that its financial transactions have finished or rolled back. For agent-state backup, pause the agent runtime as well.
2. Create a new restricted backup directory. Refuse an existing directory so a previous backup cannot be overwritten accidentally.
3. Use the PostgreSQL client's custom-format dump inside the database container. Copy the dump as a binary file with `docker cp`; PowerShell text redirection is unsuitable for binary dumps.
4. Copy the stopped web container's public and private upload directories into the same backup set. Include the agent database/checkpoints if restoring the agent runtime is part of the change.
5. Record checksums, image digest and schema migration names alongside the backup. Keep private evidence access restricted; the backup is not a public artifact.
6. Restart the same processes/resources after backup and check catalog, authentication and a permitted private-file read. Verify that no seed/drop flags were enabled.

The concrete Docker commands exercised during the disposable rehearsal were:

```powershell
docker stop model-universe-release-web
docker exec model-universe-release-db pg_dump -U model_universe_verify -d model_universe_release_test -Fc -f /tmp/model-universe-release.dump
docker cp model-universe-release-db:/tmp/model-universe-release.dump .artifacts/model-universe/release-backup-20261009/database.dump
docker cp model-universe-release-web:/app/.private-uploads .artifacts/model-universe/release-backup-20261009/private-evidence
docker cp model-universe-release-web:/app/uploads .artifacts/model-universe/release-backup-20261009/public-uploads
docker start model-universe-release-web
```

These identifiers belong only to the isolated release fixture. Resolve and record real deployment identifiers before adapting the procedure; do not reset an existing database to reproduce the fixture.

## Restore rehearsal

Restore into a newly created, explicitly named disposable database and new evidence volume. `pg_restore --exit-on-error` must finish successfully. Copy the matching public/private directories into the replacement container before exposing it, preserve `node` ownership and use the retained image digest. Never overwrite the source database during rehearsal.

Compare ordered row counts and fingerprints for historical orders/items, receipts/refunds, buyback/pawn requests/payments/events and evidence. Authenticate as an evidence owner, verify exact file bytes, then verify guest denial. A successful database restore without its matching files is incomplete. Validate current migrations without seeding and repeat the major financial/permission flows on the restored copy.

The 2026-10-09 Docker rehearsal restored `model_universe_release_test` into `model_universe_restore_20261009_test`: fingerprints matched for 11 selected tables, including 871 orders, 871 order lines and one private evidence record. The evidence SHA-256 remained `4c2bd2d552cb194f5b9cb20b5147569584d2e6f36669e8c29be99e67bec20ded`; owner access returned 200 and guest access 401. The exercised image digest was `sha256:a568d0600be5774aec165aa545bd352368b0044f7ba0e8d612aa172a6eaf04fa`. This predates the final dependency/loader refresh and proves storage recovery for that fixture, not compatibility with an older application. Detailed local evidence is ignored at `.artifacts/model-universe/backup-restore-verification.json`.

## Application cutover and rollback

Build and verify an immutable candidate image, migrate a retained-data copy and keep the previous image available. Before cutover, prove that the intended fallback application understands the additive schema and financial events that the candidate can create. A migration succeeding twice is not sufficient evidence of application rollback compatibility.

Do not roll back an active database by restoring a pre-release dump after new transactions have been accepted: that would erase purchases, payouts and evidence. Prefer a compatible application rollback using the unchanged database, or a reviewed forward repair. Application rollback compatibility remains an open release gate.

After an authorized cutover, verify actual catalog/SSR, sign-in, customer/partner ownership, verified payment replay, source inventory and private-file delivery. Reconcile any interrupted transactions and reminder jobs before resuming agent writes. Keep unresolved policy versions inactive and report any failed gate explicitly.
