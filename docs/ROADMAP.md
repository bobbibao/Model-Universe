# Roadmap: v2 rebuild and growth agent

The v2 agent (`docs/ARCHITECTURE.md`) is built in place on a dedicated branch, phase by phase, following
`docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`. A phase is done when its gate passes locally (the
owner dropped GitHub Actions on 2026-10-02, see below).

```
python scripts/gate.py --phase <n>            # fast + server tiers, cumulative
python scripts/gate.py --phase <n> --tier db  # needs AGENT_TEST_DATABASE_URL, PG_SUPERUSER_URL (scripts/dev/pg-local.sh)
```

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Foundation: v1 frozen (deleted in P4), `shop_agent` skeleton, uv + tooling, layering contracts, CI, rules and ADRs | done locally (gate green) |
| P1 | LLM provider layer: profiles, scripted model, budget middleware, `doctor`, eval harness | done locally (gate green) |
| P2 | Domain (VND), adapters, tools, pgvector knowledge base | done locally (fast, server and db gates green) |
| P3 | `improvement` + `monitor` graphs at v1 parity (dead stock, high returns), `simulate` | done locally (fast and server gates green) |
| P4 | Web gateway and console on the SDKs, automated demo (Playwright), e2e stack; **v1 deleted** | done locally (fast, server and db gates green; `@demo` passed locally, see below) |
| P5 | Growth data: migrations, attribution + consent, market data (manual, CSV, trends, competitor sites), views | done locally (fast, server and db gates green; `snapshot --check` against a seeded shop, see below) |
| P6 | Growth hands: promotions, Facebook posts, Meta/Google/TikTok ads (fakes by default), budget ledger, approval grants | done locally (fast and db gates green; live platform calls deferred, see `docs/MARKETING_LIVE_CHECKLIST.md`) |
| P7 | Growth brain: detectors, estimators, prioritizer, brand safety, tiers and autonomy ramp, measurement | done locally (fast, server and db gates green; e2e `@growth` an accepted gap, see below) |
| P8 | Copilot (`assistant` deep agent) and chat page | done locally (fast, server and db gates green; e2e `@copilot` an accepted gap, see below) |
| P9 | Hardening: Aegra prod-like runtime, durability test, Langfuse, security gates, eval gating | done locally except the web's dependency audit and the hosted gates (see below) |

## CI status

The owner dropped GitHub Actions on 2026-10-02: no job on the branch ever ran (no runner was assigned), and the
workflows were deleted. The local gate (`scripts/gate.py`, every tier) is the only verification, and phases are not
tagged `v2-phase-N`. The e2e specs run on local processes (below), as `@demo` did in Phase 4.

### Phase 4 cutover evidence

The plan deletes v1 only once `@demo` is green in CI. With CI blocked, the evidence is a local run of the same spec
on 2026-09-30: `yarn e2e --grep @demo` passed its 4 tests (detect, approve an edit to 25 %, reject, measure and learn)
against the seeded shop (`yarn seed-ci`), the production web build and `langgraph dev` with the scripted model and
`DEMO_MEASURE_AFTER_MINUTES=1`, all on local processes. The compose e2e stack (`infra/docker-compose.yml`, profile
`e2e`) was validated with `docker compose config` only (no Docker daemon in the build environment), so its first run
on a Docker host is the first run of the images. The gaps that kept e2e off Aegra are closed (Phase 9, ADR-0013).

### Phase 5 evidence

With CI blocked, the e2e-tier check (`shop-agent snapshot --check`, which the compose `ingest` service also runs) was
run on 2026-09-30 against a local Postgres seeded with `yarn seed-ci` and the real `ci_reader` role: every growth view
was readable with its columns (179 days of sales, 124 products, 192 competitor prices, 540 trend points, 30 calendar
events). The same shop served by `yarn dev` accepted `shop-agent collect --source fixture` through the real Agent API
(a second run the same day was skipped), and `shop-agent ingest` indexed the catalog from `analytics.catalog`. The
`competitor_sites` collector was run once against a local page in headless Chromium: it read the price a script added,
skipped the page robots.txt disallowed, and never requested the marketplace URL.

### Phase 6 evidence

Contract 0.4.0 and its 106 limit vectors pass on both sides (the agent's FakeShop and `AgentLimits.ts`). The web's db
tests run every new endpoint against a seeded shop: grants (tampered, expired, re-keyed, wrong endpoint, wrong body
refused; replay first), auto_low inside and above the low caps, the kill switch, 20 racing reservations against the
month's cap (14 of 700,000 VND fit 10,000,000), the 50% stacking rule and the checkout clamp, posts, ads, the metrics
sync and conversion events on the fakes. The live clients have offline request-mapping tests only (nock, and
`jest.mock` for Google's gRPC library); no live platform was called.

### Phase 7 evidence

The growth brain is verified in process: the growth domain at 96% coverage with the six named properties; the growth
graph tests (a low-tier promotion and post run on autonomy, a medium-tier and a first-platform ad interrupt, shadow
writes nothing, two brand failures need a person, a ROAS breach pauses with no model call, the kill switch opens no
growth threads, capacity holds); `shop-agent simulate growth` over 90 days of Q4 2026 (three injected market events
each detected the same day, no refused write, every applied change granted or autonomous, the ledger never negative);
the growth eval suite at 23/23 on the scripted profile (9 critical cases); and on the web the autonomy ramp, the
step-up approval and the scorecard (unit and db tests, 207 and 100 passing).

Accepted gap (owner, 2026-10-02): the e2e spec `@growth` (approve a promotion and post with edited copy, check out
with the agent's coupon, see the outcome on `/admin/agent/growth`) is not written. Which growth proposal opens first on
the seeded shop depends on the prioritizer's ranking of that data, so the spec was not written blind. Its parts are
covered below the browser: the gateway's high-tier checks (unit), the ramp gate and the scorecard (db), attribution
and coupons at checkout (db, Phase 5), and the improvement graph on growth kinds.

### Phase 8 evidence

`python scripts/gate.py --phase 8` passed on 2026-10-02: 31/31 fast and server checks, 5/5 db checks.

The copilot is one deep agent (`graphs/assistant.py`) with the read, estimator and knowledge tools and the write tools
behind `HumanInTheLoopMiddleware`, three subagents without write tools (`analyst`, `customer_voice`, `copywriter`),
playbooks from `skills/`, approved memory in the Store and a daily-briefing cron. Verified:

- graph tests (scripted model, FakeShop that refuses a write without a valid grant): a write interrupts and nothing
  runs; an edit runs the edited body with its grant, and a grant over the model's body does not cover the edit; a
  reject runs nothing; a low-risk call in `auto_low` runs without a person and one above the caps waits; protective
  tools never wait; the subagents have no write tool and there is no general-purpose subagent; a memory write waits
  and lands in the Store once approved; a run without a context resolves its dependencies; a subagent reports through
  `task`;
- the write-tool contract vectors (`packages/contracts/test-vectors/copilot/write-tools.json`) on both sides, and the
  gateway's approvals (sign over the approved or edited requests, keyed `{thread}:{call}`, refuse edits outside the
  editable fields, never forward a browser's grant or command update);
- on the real `langgraph dev`: the thread pauses with the request the gateway reads, the resume with a grant in
  `approval_grants` reaches the OpenAPI-validated web double with exactly the approved body, its key and the grant;
  the crons (with the briefing) and auth (`system` runs the briefing) pass;
- the analyst's SQL on Postgres as `ci_reader`: read-only even for a role that could write, `analytics` only, one
  statement, 200-row cap; the copilot eval suite at 6/6 on the scripted profile (2 critical cases).

Accepted gap (owner, 2026-10-02): the e2e spec `@copilot` (ask for a 10% coupon on orders from 500k, edit it to
12%, approve, the coupon exists) is not written. The scripted model answers by script key and a chat from the browser
carries none, so the spec needs a scripted conversation for unlabelled chats on the e2e stack; like `@growth`, its
parts are covered below the browser (gateway unit tests, the dev-server test above and the production build of
`/admin/agent/copilot`).

### Phase 9 evidence

`python scripts/gate.py --phase 9` passed on 2026-10-02: 33/33 fast and server checks; `--tier db --tier runtime`
6/6; `--tier security` 2/3 (the web's dependency audit fails, see below); `--tier hosted` waits for the API key.

- Production runtime (ADR-0013): Aegra 0.10.8 with Postgres and Redis serves the shop. Every gap is closed or
  avoided: one tenant identity (`shop`) so admins see the threads `monitor` opens; the Store index on
  `ollama:bge-m3`; thread values read from state; crons created disabled then enabled; LangGraph's default durability.
  `@demo` passed its 4 tests against the production web build and Aegra on local processes, twice (the second run on
  the final code, a fresh agent database: no cron ran at creation, and each action's audit row has the run id).
- Durability (`-m runtime`): the server is killed in Act right after the first step reached the shop; after a restart
  Aegra re-queues the run and every step is applied exactly once (the first answered as a replay), each request
  carrying the run as its W3C trace. `sync-crons` on Aegra leaves four enabled crons and runs nothing early.
- Tracing: Langfuse's handler on `improvement` and `assistant` when its keys are set, masked (emails, phone numbers);
  `monitor` and `collect` are not traced. Every write made in a run sends its run id in `X-Agent-Context` and as the
  trace id of its `traceparent`; the web records both on the action (`runId`, `traceId`).
- Security: the git history has no secret (gitleaks 8.16; seven test-only values from v1 tests and the web's db test
  support are listed in `.gitleaksignore`), the locked Python packages have no known vulnerability (pip-audit 2.10.1),
  the agent image runs as a non-root user, the copilot's `customer_voice` redacts personal data, and the three
  prompt-injection eval cases are critical. Every eval suite passes on the scripted profile (40/40).
- `docs/RUNBOOK.md`: kill switch, pausing ads, reverting, the ramp, re-indexing, rotating secrets, going live, the
  runtime.

Open, needs the owner:

- **Web dependency audit (red).** `yarn npm audit --severity high` reports advisories in `next` 14.2.35 (two
  critical: remote code execution in the image optimizer with AVIF files and on Windows hosts; eight high: denial of
  service, request forgery, a middleware bypass) whose only fixes are Next.js 15.5.24 or later (14.2.35 is the last 14.x release), and
  in `nodemailer` 6 (fixed in 10.0.6+), `@faker-js/faker` 8 (seeders only; fixed in 10.4.1+), and `glob`, `minimatch`,
  `postcss` (build and lint tooling). Clearing it means moving the web app to Next.js 15.5 with React 19, a framework
  migration outside this refactor.
- **Hosted gates.** `python scripts/gate.py --phase 9 --tier hosted` (`doctor --profile anthropic --live` and every
  eval suite on the anthropic profile, whose first run writes the baselines) waits for `ANTHROPIC_API_KEY`. The
  bake-off is `python -m evals.runner --suite all --profile anthropic openai google local-large --report
  evals/reports/bakeoff.md`.

## Decisions

ADR-0009 (the redesign), ADR-0010 (LLM layer), ADR-0011 (growth autonomy), ADR-0012 (engineering baseline), ADR-0013
(Aegra), ADR-0014 (compliance). The plan's section 10 lists the remaining owner inputs (competitors, brand guide
approval, accounts and keys for going live, one legal review).

## Deferred within the plan

- Live calls to Facebook, Meta Ads, Google Ads and TikTok Ads (owner decision): `docs/MARKETING_LIVE_CHECKLIST.md`.

## Dropped from v1

- `near_expiry` detection: the shop has no expiry data.
- Agent-side Telegram, Zalo and email channels, the recipient directory and the events webhook (D5): the inbox badge
  and one web email replace them. The web no longer creates the approvers view (`analytics.ci_recipients`); a database
  created before Phase 4 keeps it until it is reseeded or the view is dropped by hand.
- The v1 follow-ups in the old roadmap (persisted ACTING claim, step compensation after a timeout, background runs,
  overlapping discounts, Vietnamese agent text) are addressed by the v2 design: runs, checkpoints and idempotency keys
  from the runtime, the overlap rule in the discount endpoint, and `AGENT_LANGUAGE`.
