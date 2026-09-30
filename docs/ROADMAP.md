# Roadmap: v2 rebuild and growth agent

The v2 agent (`docs/ARCHITECTURE.md`) is built in place on a dedicated branch, phase by phase, following
`docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`. A phase is done when its gate passes locally and CI is
green on the pushed commit; it is then tagged `v2-phase-N`.

```
python scripts/gate.py --phase <n>            # fast + server tiers, cumulative
python scripts/gate.py --phase <n> --tier db  # needs AGENT_TEST_DATABASE_URL, PG_SUPERUSER_URL (scripts/dev/pg-local.sh)
```

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Foundation: v1 frozen (deleted in P4), `shop_agent` skeleton, uv + tooling, layering contracts, CI, rules and ADRs | done locally (gate green); CI blocked (see below) |
| P1 | LLM provider layer: profiles, scripted model, budget middleware, `doctor`, eval harness | done locally (gate green) |
| P2 | Domain (VND), adapters, tools, pgvector knowledge base | done locally (fast, server and db gates green) |
| P3 | `improvement` + `monitor` graphs at v1 parity (dead stock, high returns), `simulate` | done locally (fast and server gates green) |
| P4 | Web gateway and console on the SDKs, automated demo (Playwright), e2e stack; **v1 deleted** | done locally (fast, server and db gates green; `@demo` passed locally, see below) |
| P5 | Growth data: migrations, attribution + consent, market data (manual, CSV, trends, competitor sites), views | done locally (fast, server and db gates green; `snapshot --check` against a seeded shop, see below) |
| P6 | Growth hands: promotions, Facebook posts, Meta/Google/TikTok ads (fakes by default), budget ledger, approval grants | planned |
| P7 | Growth brain: detectors, estimators, prioritizer, brand safety, tiers and autonomy ramp, measurement | planned |
| P8 | Copilot (`assistant` deep agent) and chat page | planned |
| P9 | Hardening: Aegra prod-like runtime, durability test, Langfuse, security gates, eval gating | planned |

## CI status

Every GitHub Actions job on the branch fails within seconds without running a step (no runner is assigned, no log), for
every workflow. That is an account or repository setting (Actions disabled, or the account's Actions minutes / billing),
not a workflow error: check Settings > Actions and Billing. Until it is fixed, phases are verified with the same
commands locally (`scripts/gate.py`) and are not tagged `v2-phase-N`.

### Phase 4 cutover evidence

The plan deletes v1 only once `@demo` is green in CI. With CI blocked, the evidence is a local run of the same spec
on 2026-09-30: `yarn e2e --grep @demo` passed its 4 tests (detect, approve an edit to 25 %, reject, measure and learn)
against the seeded shop (`yarn seed-ci`), the production web build and `langgraph dev` with the scripted model and
`DEMO_MEASURE_AFTER_MINUTES=1`, all on local processes. The compose e2e stack (`.github/workflows/e2e.yml`) was
validated with `docker compose config` only (no Docker daemon in the build environment), so its first CI run is the
first run of the images. The e2e stack runs on `langgraph dev` until the Aegra gaps in ADR-0013 are closed (P9).

### Phase 5 evidence

With CI blocked, the e2e-tier check (`shop-agent snapshot --check`, which the compose `ingest` service also runs) was
run on 2026-09-30 against a local Postgres seeded with `yarn seed-ci` and the real `ci_reader` role: every growth view
was readable with its columns (179 days of sales, 124 products, 192 competitor prices, 540 trend points, 30 calendar
events). The same shop served by `yarn dev` accepted `shop-agent collect --source fixture` through the real Agent API
(a second run the same day was skipped), and `shop-agent ingest` indexed the catalog from `analytics.catalog`. The
`competitor_sites` collector was run once against a local page in headless Chromium: it read the price a script added,
skipped the page robots.txt disallowed, and never requested the marketplace URL.

## Decisions

ADR-0009 (the redesign), ADR-0010 (LLM layer), ADR-0011 (growth autonomy), ADR-0012 (engineering baseline), ADR-0013
(Aegra), ADR-0014 (compliance). The plan's section 10 lists the remaining owner inputs (competitors, brand guide
approval, accounts and keys for going live, one legal review).

## Deferred within the plan

- The analyst's SQL toolkit (`tools/sql.py`, plan 2.3) is built in P8 with the `analyst` subagent, its only user.
- Server-side conversion events (Meta Conversions API, TikTok Events API, Google Ads offline conversions) come with
  the ad platforms in P6; P5 ships the consent banner, the browser tags and the `event_id` they share.

## Dropped from v1

- `near_expiry` detection: the shop has no expiry data.
- Agent-side Telegram, Zalo and email channels, the recipient directory and the events webhook (D5): the inbox badge
  and one web email replace them. The web no longer creates the approvers view (`analytics.ci_recipients`); a database
  created before Phase 4 keeps it until it is reseeded or the view is dropped by hand.
- The v1 follow-ups in the old roadmap (persisted ACTING claim, step compensation after a timeout, background runs,
  overlapping discounts, Vietnamese agent text) are addressed by the v2 design: runs, checkpoints and idempotency keys
  from the runtime, the overlap rule in the discount endpoint, and `AGENT_LANGUAGE`.
