# Roadmap: what's real vs. stubbed

The domain, application layer and the whole Detect -> Learn loop are implemented and tested
against `FakeShop` (`pytest`, `python -m ci_agent.interfaces.cli simulate`). These tasks connect
it to real systems. Each stub's docstring references its task id below.

| id | Task | Where | Priority |
|----|------|-------|----------|
| T-01 | **Done** (ADR-0008). `LlmReasoner`: an LLM writes the analysis, the question text and the lessons; the rules still decide (`actionable`, options, amounts) and answer whenever the LLM fails. Two providers behind one port: `LLM_PROVIDER=ollama` (native structured output, first target `qwen2.5:3b`) and `claude` (official SDK, `claude-sonnet-5`, `ANTHROPIC_API_KEY`, daily budget). No tools. Console shows an AI / quy tắc badge per cause. Draft SOP-001/SOP-002 in `data/sop/` for the owner's review. Later: output language as a setting, per-request LLM time budget | `infrastructure/reasoning/llm_*.py`, `data/sop/` | High - needed for a real demo |
| T-02 | Implement `PostgresImprovementRepository` (JSONB + optimistic locking, see `schema.sql`) | `infrastructure/persistence/postgres/repository.py` | High - needed to survive a restart |
| T-03a | **Done.** Web side of real reads: a minimal returns feature (customer request on a delivered order, admin intake with condition and VND refund, explicit restock), dev seed data that makes the dead-stock and high-returns signals fire, the `analytics` views and the read-only `ci_reader` role | `apps/web-ecommerce`, `infra/sql/` | High - needed once the real web app exists |
| T-03b | **Done.** Agent side of real reads: `SqlShopReadAdapter` over the `analytics` views (money converted at the boundary with `MONEY_UNIT_VND`), shared KPI definitions with FakeShop, `SHOP_READ_ADAPTER=sql` by default (`fake` dev-only) | `infrastructure/shop/sql_read.py`, `bootstrap/container.py` | High |
| T-03c | **Done** under the formatting-only domain exception of ADR-0007 (`docs/adr/0007-money-format-in-domain-text.md`). Agent-written text shows VND: dead-stock signal summaries, measurement summaries (no more scientific notation), guardrail messages, strategy assumptions and notification bodies (web inbox, Telegram, email, Zalo) all use `MoneyFormat`; the default reproduces the previous text exactly. `AUTONOMY_MODE` stays `always_ask` until the owner decides otherwise | agent `domain/`, `application/`, `bootstrap/` | Medium |
| T-04 | **Done.** Real auth: every route verifies a short-lived actor JWT minted by the web proxy with `AGENT_ACTOR_SECRET` (not the web's session secret, by design); the agent->web direction uses `SHOP_API_TOKEN`; the Telegram webhook refuses updates without a configured secret; Zalo's webhook is only mounted when Zalo is configured | `interfaces/http/auth.py` | High |
| T-05 | Verify the Zalo OA API shape against current docs (endpoint, payload, token refresh) | `infrastructure/notifications/zalo.py` | Medium - only needed if Zalo is in scope for the demo |
| T-06 | pgvector-backed case memory and SOP search (replace keyword overlap) | `infrastructure/persistence/postgres/` (new), `infrastructure/knowledge/` | Medium |
| T-07 | Transactional outbox worker: write events in the same transaction as the aggregate, deliver at-least-once | `infrastructure/persistence/postgres/`, `ci.event_outbox` table | Medium - `WebWebhookPublisher` is currently best-effort |
| T-08 | Load `RecipientDirectoryPort` from the web app's real user table instead of static config | `infrastructure/notifications/directory.py`, `bootstrap/container.py` | Medium |
| T-09 | Scheduler process that calls `WorkflowCoordinator.tick()` on an interval and exposes SSE progress | `interfaces/http/routers` (new), a small loop or APScheduler | Medium |
| T-10 | **Done.** `apps/web-ecommerce` CI Console: Agent API (idempotent, revertible, real storefront effects), signed events webhook, admin proxy, proposal inbox + decision page, agent task list, KPI impact page (`/admin/ci/impact`), case library (`/admin/ci/cases`). Until T-03, `SHOP_READ_ADAPTER=fake` feeds Detect with FakeShop data whose SKUs do not exist in the shop, so Act fails and rolls back | `apps/web-ecommerce` (`/admin/ci/*`, `/api/agent/v1/*`) | High - the other half of the demo |

## Suggested build order for the hackathon

1. T-04 (done) and T-10's Agent
   API + a minimal proposal inbox page - this lets a human actually answer from the web.
2. T-03a (web: returns, seed data, analytics views), then T-03b (agent: SQL read adapter), then T-03c
   (converted currency in agent-written text).
3. T-01 (LLM reasoner) - the loop already works with `RuleBasedReasoner`; swapping in the LLM
   is the "wow" upgrade, not a blocker for a first working demo.
4. T-02 (Postgres) once you need the demo to survive a restart.
5. T-05/T-08/T-06/T-07/T-09 as time allows; the in-memory/static equivalents work for a live
   demo.
