# Autonomous run log

Unattended run started 2026-09-29 on branch `feat/ci-t04-t10a` (after `dd61952`, T-02). One section per phase:
plan, decisions and why, what was tested, what is left. No secret values appear here, only names.

Status: **running**.

## Environment created (names only)

- Role and database `ci_agent_test` (throwaway, for the env-gated Postgres tests), created with
  `infra/sql/ci_agent.sql -v agent_role=ci_agent_test -v agent_db=ci_agent_test`.
- `apps/agent-service/.env`: added `AGENT_TEST_DATABASE_URL` (generated password, letters and digits).
- Existing and left as they are: databases `ci_agent` (agent state), `web_ecommerce_ci_verify` (seed data, read by
  `ci_reader`), roles `ci_agent`, `ci_reader`. Not touched: `web-ecommerce`, `vizera`, `postgres`.

## Phase 0 - Baseline

Gates (before any change in this run):

| Gate | Result |
|---|---|
| agent pytest, with `AGENT_TEST_DATABASE_URL` | 251 passed, 12 skipped |
| agent pytest, with the test DB and `SHOP_READ_TEST_DSN` (= the agent's `SHOP_READ_DSN`) | shop-read integration: 5 passed |
| agent pytest, no databases | 233 passed, 30 skipped |
| architecture (layering) | passed |
| `simulate --auto-approve` | ok, 7 improvements closed |
| ruff `src tests` | 75 findings, all pre-existing (26 I001, 18 UP035, 11 B008 FastAPI `Depends`, ...) |
| mypy `src` | 1 pre-existing error: `infrastructure/system/signer.py:27` (`binascii` attribute) |
| web type-check / lint / build | ok / ok (58 warnings, 0 errors) / ok |

Remaining skips with the test DB: `tests/integration/test_web_agent_api.py` needs a running web app
(`WEB_AGENT_API_URL`); run in Phase 3.

Decision: the pre-existing ruff findings and the mypy error are not fixed here ("fix nothing unrelated"); the gate
for this run is "no new findings in changed files, no new mypy errors".

## Phase 1 - T-02 leftovers

### 1a. Crash mid-Act
Plan: prove that a crash after the web calls but before the save cannot apply anything twice.
Finding from the code: `ExecutePlan` never saves `ACTING`; it saves only the result, together with
`action_attempts`. After a crash the stored improvement is still `PLANNED` with the same attempt number, so the retry
derives the same keys (`improvement:plan_hash:attempt:step`, `command_executor.idempotency_key`) and, since the plan
is hash-protected, the same bodies.
Test: `tests/e2e/test_crash_mid_act.py` (in memory, and on Postgres with a new connection pool for the "restarted"
process). The real `HttpShopActionAdapter` talks to `tests/support/web_double.py`, which implements the web Agent
API's idempotency contract (new key applied once; same key + same body replays; same key + different body 409; dry
runs not stored). The crash is a `BaseException` raised by a repository wrapper right before the Act result is saved.
Result: the retry sends byte-identical requests (same URLs, keys, bodies), all replayed, 0 conflicts, nothing applied
twice, and the improvement ends in `MEASURING` with the first attempt's external refs. The real web app's side of the
contract is covered by `tests/integration/test_web_agent_api.py` (run in phase 3).

### 1b. Can the 14-day measurement window be configured for demos?
Answer: not in the domain. The window is a domain constant (`MeasurementPlan(..., 14, 10.0)` per signal kind in
`domain/strategies/_common.py`); changing it is a rule/constant change, outside the ADR-0007 exception, so domain/ is
untouched.
Decision (safest option): a demo-only override of *when* Measure runs, in application/bootstrap. `ExecutePlan` takes
`demo_measure_after` (wired from `WorkflowOptions.demo_measure_after`, set by `DEMO_MEASURE_AFTER_MINUTES`). It only
changes `measure_due_at`; the plan's window, KPIs, threshold and hash are unchanged, and the "acted" audit entry
records `demo_measure_after_minutes`. Refused with `APP_ENV=production` (settings validation), logged as a WARNING at
startup. Why not a fast-forward clock: moving the clock would also expire every open question (48 h TTL) and shift
signal cooldowns, which would distort the rest of the demo.
Caveat: measured minutes after Act, real shop KPIs have barely moved, so the verdict will usually be "inconclusive";
the demo shows the Measure and Learn mechanics, not a real effect.
Test: `tests/e2e/test_demo_measure_window.py` (measures after 5 minutes, not after 4; plan window still 14; off by
default; refused in production; negative refused).

### 1c. Guarded reset
`python -m ci_agent.interfaces.cli reset-agent-data --confirm-delete-all-agent-data` empties `ci.improvements`,
`ci.cases`, `ci.audit_log`, `ci.notification_log`, `ci.llm_spend` in `DATABASE_URL` (the schema and its version stay).
Without the flag it only says what it would delete (exit 2). Refused with `APP_ENV=production`, and while an agent
process is connected (the agent's pool now sets `application_name=ci-agent`; the reset checks `pg_stat_activity`).
Use after `yarn seed-dev` on the web side, whose ids the stored improvements refer to.
Test: `tests/integration/test_reset_agent_data.py`.

### 1d. docker-compose
`infra/docker-compose.yml` rewritten: Postgres 18 on 127.0.0.1:55432, no default credentials (every secret is a
required `${VAR:?}` from git-ignored `infra/.env`, template `infra/.env.example`); an init script
(`infra/docker/initdb/10-ci-databases.sh`) creates the web database, runs `ci_reader.sql` and `ci_agent.sql`; the
agent's URLs point at the compose services. Added `apps/agent-service/Dockerfile` (there was none) and `.dockerignore`
(excludes `.env`). The web service keeps the web app's own Dockerfile convention (`.env.<ENVIRONMENT>` baked in).
Verified: `docker compose config` refuses a missing secret; `up db agent-service` with a throwaway env file of random
values started both, the init script created `web_ecommerce`, `ci_agent`, non-superuser `ci_reader` and `ci_agent`, the
agent applied its schema and answered on :8000; then `down -v` removed containers and volume. The web container was not
built (it needs a `.env.<ENVIRONMENT>` file the repo does not have): unverified.
Downloaded: Docker images `postgres:18`, `python:3.12-slim` (local image cache only).

### Review and gates (phase 1)
`ci-domain-architect` reviewed the application change (`ExecutePlan.demo_measure_after`): no required fixes; it is a
scheduling-only change after Ask/approval/guardrails/hash checks, no verdict rule reads the window, domain untouched,
layering green. Optional points applied: compose forwards `DEMO_MEASURE_AFTER_MINUTES` (settings now use
`env_ignore_empty=True`, so an empty variable means "not set"; tested); the reset locks the agent tables before its
running-agent check (closes the gap between check and TRUNCATE; a busy table gives a clear refusal); `due` computed
once; import order. Not applied: a time of day in the "measured on" notification text (would change pinned text), a
`demo_window` flag in the improvement DTO (phase 2 exposes the demo settings in a status endpoint instead), a demo
marker on `CaseRecord` (a domain model change).
Gates: agent pytest with the test DB 260 passed / 12 skipped (the rest need a running web app or `SHOP_READ_TEST_DSN`,
which passes separately: 5), architecture ok, simulate ok, no new ruff findings in changed files, mypy only the
pre-existing `signer.py` error. Web untouched in this phase.
Left: web container in compose not built (see 1d).

## Phase 2 - T-09 scheduler

Plan: an in-process scheduler (no new dependency) that drives the same `WorkflowCoordinator.tick()` as the manual
button, a single place that serialises runs, live progress over SSE, and a small progress line in the web console.

What was built:
- `application/workflow.py`: `tick(progress=None)` reports `detected` and per-improvement `advanced` events through an
  optional plain callback (a failing observer is ignored). `advance()` now claims the improvement for the calling
  runner (per-process claim set); a second runner gets `ImprovementBusy`: a tick records it in `report.skipped` (the
  next run takes it), `submit_answer` returns the saved state instead of an error (also when it loses the optimistic
  save to a run). A closed question is still a 409.
- `interfaces/runs.py`: `RunManager` (one run at a time, a second caller gets `None` and is not queued; status; event
  fan-out, broken subscribers dropped) and `TickScheduler` (daemon thread, fixed delay after each run, catches every
  error, `stop(timeout)`).
- HTTP: `POST /runs` 409 while a run is going; `GET /runs/status`; `GET /runs/events` (SSE: `status` first, then
  run_started/detected/advanced/run_finished/run_failed, keep-alive every 15 s, closes after 300 s so the client
  reconnects with a fresh actor token). Same `require_role(MANAGER)` actor-JWT auth as `/runs`.
- Lifespan: starts the scheduler when `SCHEDULER_ENABLED` (unset: on only with `APP_ENV=production`), stops it at
  shutdown (10 s); if a run is still going, the DB pool is left to the process exit rather than closed under it.
- Web: `/api/admin/ci/runs/status` and `/api/admin/ci/runs/events` (Express pipes the agent stream; aborts upstream
  when the browser leaves), `RunStatusBar` above the inbox (live progress, last run, scheduler state, a "DEMO: đo kết
  quả sau N phút" badge when `DEMO_MEASURE_AFTER_MINUTES` is set), the run button disabled while any run is going, and
  a proper Vietnamese message when a manual run hits 409.
- Demo path for Measure/Learn: phase 1b (`DEMO_MEASURE_AFTER_MINUTES`), shown in `/runs/status` and the console badge,
  refused in production.

Decisions:
- In-process thread instead of APScheduler or a separate worker: no new dependency, and the no-overlap lock and the
  per-improvement claims only work inside one process. Documented: run one agent process (ROADMAP T-09).
- Manual run while busy answers 409 at once instead of waiting: a click never blocks for minutes behind a slow LLM run.
- `POST /runs` stays synchronous (the web waits up to 300 s); progress is visible over SSE meanwhile.

Review (`ci-domain-architect`): required R1 (a tick and a web decision could run Act on the same improvement at once;
harmless with identical replays, but a transient failure on one side could lead to a step applied twice), R2 (a
saved decision reported as 409 when its continuation lost the race), R3 (Vietnamese in a code comment). All three fixed
as above (R1 with the per-improvement claim, application only, domain untouched). Optional applied: subscribe inside
the SSE generator (no subscriber leak), don't close the pool under a running tick, empty `SCHEDULER_ENABLED` means
unset (tested). Not applied, logged as follow-ups:
- Durable multi-process safety: persist an ACTING claim before the shop calls plus an ACTING-recovery transition. This is
  a domain change (new transition), outside the ADR-0007 exception: needs its own decision/ADR. Until then: one process.
- `CommandExecutor._compensate` skips FAILED steps; a client-side timeout on a step the web actually applied is not
  reverted, and the next attempt's new keys could apply it again (pre-existing, application; worth a small task).
- Cooperative stop between improvements inside a tick (a stop currently waits for the running improvement).

Tests: `tests/unit/interfaces/test_runs.py` (no overlap incl. a slow run with the scheduler and 5 manual attempts;
failed run reported and lock released; scheduler survives a failing run; prompt and bounded stop; progress events and a
broken subscriber; per-improvement error isolation with progress; observer errors ignored; 401/403 on `/runs/status`
and `/runs/events`; SSE stream content; 409 while busy; lifespan starts/stops the scheduler; setting defaults; empty
variable), `tests/unit/application/test_advance_claims.py` (busy improvement, tick skip then next run, saved decision
not an error, closed question still 409), `tests/e2e/test_restart_mid_tick.py` (Postgres: the process dies while saving
the second analysis; the next run in a new process finishes it with no duplicate improvement, question or audit step).
The threading tests were run 10 times in a row: 10/10 green.
Live check: web dev server + agent (rule-based, scheduler every 60 s, real `ci_agent` and seed DBs): the SSE stream
through the web proxy delivered `status`, a manual run and a scheduled run; two simultaneous manual clicks gave one 200
and one 409 with the Vietnamese message.
Gates: agent 287 passed / 7 skipped with the test DBs, architecture ok, simulate ok, mypy only the pre-existing error,
ruff: no new findings except FastAPI `Depends` defaults on the two new routes (the repo's existing convention) ; web
type-check ok, lint 58 warnings 0 errors (unchanged), build ok.
