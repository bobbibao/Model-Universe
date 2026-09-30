# Roadmap: what's real vs. stubbed

The domain, application layer and the whole Detect -> Learn loop are implemented and tested
against `FakeShop` (`pytest`, `python -m ci_agent.interfaces.cli simulate`). These tasks connect
it to real systems. Each stub's docstring references its task id below.

| id | Task | Where | Priority |
|----|------|-------|----------|
| T-01 | **Done** (ADR-0008). `LlmReasoner`: an LLM writes the analysis, the question text and the lessons; the rules still decide (`actionable`, options, amounts) and answer whenever the LLM fails. Two providers behind one port: `LLM_PROVIDER=ollama` (native structured output, first target `qwen2.5:3b`) and `claude` (official SDK, `claude-sonnet-5`, `ANTHROPIC_API_KEY`, daily budget). No tools. Console shows an AI / quy tắc badge per cause. Draft SOP-001/SOP-002 in `data/sop/` for the owner's review. Later: output language as a setting, per-request LLM time budget | `infrastructure/reasoning/llm_*.py`, `data/sop/` | High - needed for a real demo |
| T-02 | **Done.** The agent's state survives a restart: improvements (JSONB + optimistic locking), case memory (keyword search), audit log, notification log and the Claude LLM spend live in the agent's own database `ci_agent` (role and database from `infra/sql/ci_agent.sql`; tables applied by the agent at startup with a schema-version check). `PERSISTENCE_ADAPTER=postgres` by default with `DATABASE_URL` from the environment only; `memory` is dev-only. Contract tests run against both adapters with `AGENT_TEST_DATABASE_URL` | `infrastructure/persistence/postgres/`, `infra/sql/ci_agent.sql` | High |
| T-03a | **Done.** Web side of real reads: a minimal returns feature (customer request on a delivered order, admin intake with condition and VND refund, explicit restock), dev seed data that makes the dead-stock and high-returns signals fire, the `analytics` views and the read-only `ci_reader` role | `apps/web-ecommerce`, `infra/sql/` | High - needed once the real web app exists |
| T-03b | **Done.** Agent side of real reads: `SqlShopReadAdapter` over the `analytics` views (money converted at the boundary with `MONEY_UNIT_VND`), shared KPI definitions with FakeShop, `SHOP_READ_ADAPTER=sql` by default (`fake` dev-only) | `infrastructure/shop/sql_read.py`, `bootstrap/container.py` | High |
| T-03c | **Done** under the formatting-only domain exception of ADR-0007 (`docs/adr/0007-money-format-in-domain-text.md`). Agent-written text shows VND: dead-stock signal summaries, measurement summaries (no more scientific notation), guardrail messages, strategy assumptions and notification bodies (web inbox, Telegram, email, Zalo) all use `MoneyFormat`; the default reproduces the previous text exactly. `AUTONOMY_MODE` stays `always_ask` until the owner decides otherwise | agent `domain/`, `application/`, `bootstrap/` | Medium |
| T-04 | **Done.** Real auth: every route verifies a short-lived actor JWT minted by the web proxy with `AGENT_ACTOR_SECRET` (not the web's session secret, by design); the agent->web direction uses `SHOP_API_TOKEN`; the Telegram webhook refuses updates without a configured secret; Zalo's webhook is only mounted when Zalo is configured | `interfaces/http/auth.py` | High |
| T-05 | Verify the Zalo OA API shape against current docs (endpoint, payload, token refresh) | `infrastructure/notifications/zalo.py` | Medium - only needed if Zalo is in scope for the demo |
| T-06 | pgvector-backed case memory and SOP search (replace keyword overlap). Needs the `vector` extension installed on the Postgres server (it is not on the dev machine yet), an `embedding` column on `ci.cases` and a schema-version bump with a migration | `infrastructure/persistence/postgres/`, `infrastructure/knowledge/` | Medium |
| T-07 | Transactional outbox worker: write events in the same transaction as the aggregate, deliver at-least-once | `infrastructure/persistence/postgres/`, a new `ci.event_outbox` table (schema-version bump) | Medium - events are published after the save commits, best effort: a crash in between loses that event from the web timeline |
| T-08 | Load `RecipientDirectoryPort` from the web app's real user table instead of static config | `infrastructure/notifications/directory.py`, `bootstrap/container.py` | Medium |
| T-09 | **Done.** In-process scheduler (`interfaces/runs.py`): a run every `SCHEDULER_INTERVAL_MINUTES` counted from the end of the previous one, never two runs at once (the manual button gets 409 while one is going), one improvement advanced by one runner at a time (a web decision and a run never act on the same improvement concurrently), errors isolated per improvement and per run, clean stop at shutdown. `SCHEDULER_ENABLED` defaults to on only with `APP_ENV=production`. `GET /runs/status` and `GET /runs/events` (SSE, same actor-JWT auth) feed a live progress line in the console inbox. Run a single agent process: the no-overlap guarantees are per process (a Postgres advisory lock would be needed for several workers or replicas) | `interfaces/runs.py`, `interfaces/http/routers/runs.py` | Medium |
| T-10 | **Done.** `apps/web-ecommerce` CI Console: Agent API (idempotent, revertible, real storefront effects), signed events webhook, admin proxy, proposal inbox + decision page, agent task list, KPI impact page (`/admin/ci/impact`), case library (`/admin/ci/cases`). Since T-03 the agent reads the real shop; T-09 added the run status line with live progress to the inbox | `apps/web-ecommerce` (`/admin/ci/*`, `/api/agent/v1/*`) | High - the other half of the demo |

## Status (2026-09-29)

Done: T-01, T-02, T-03a/b/c, T-04, T-09, T-10. The full loop runs against the real web shop with a local LLM, a human
decision in the console, real writes through the Agent API, a restart in the middle, and demo-window Measure and
Learn (docs/DEMO.md, docs/AUTONOMOUS_LOG.md phase 3). Open: T-05 (Zalo), T-06 (pgvector, not installed), T-07
(outbox), T-08 (recipients from the web's users).

## Follow-ups found during the autonomous run (docs/AUTONOMOUS_LOG.md)

| Item | Why | Needs |
|---|---|---|
| Persist an ACTING claim before the shop calls, and an ACTING-recovery transition | Makes "one runner per improvement" hold across processes and restarts; today it is per process (run one agent process) | A domain change (new transition): its own decision/ADR |
| Compensate FAILED steps too | A client-side timeout on a step the web did apply is not reverted; the next attempt's new keys could apply it again | Small application change in `CommandExecutor._compensate` (a revert of a never-applied key is a harmless 404) |
| Cooperative stop inside a tick | Shutdown waits for the improvement in progress (bounded, 10 s) | Application change |
| `POST /runs` in the background | A manual run holds a request for the whole tick (up to minutes with a slow LLM); progress is already on SSE | Interface change + web button behaviour |
| Refresh the KPI baseline on a retried Act | Attempt 2 reuses attempt 1's baseline (now up to one scheduler interval, at most the 24 h retry window, older), so drift in between counts as the plan's effect | Domain change (`Improvement.start_action` keeps the first baseline) |
| Re-try failed compensations when a plan is abandoned | An abandoned plan whose rollback failed can leave, e.g., a discount live with nothing measuring it | Application change + an alert |
| A time of day in "results will be measured on ..." | With the demo window the date alone reads as "today" | Changes pinned notification text |
