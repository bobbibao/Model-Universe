# CLAUDE.md - instructions for Claude Code in this repo

Monorepo: `apps/web-ecommerce` (Next.js 14 + Express + Sequelize shop; conventions in
`apps/web-ecommerce/docs/PROJECT_OVERVIEW.md`) and `apps/agent-service` (Python 3.12, LangGraph graphs `improvement`,
`monitor`, `collect`, `assistant`). Read `docs/ARCHITECTURE_V2.md`, then `docs/GROWTH_AGENT.md`, then `docs/ROADMAP.md`.
The v2 rebuild follows `docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`; the frozen v1 agent lives in
`apps/agent-service/legacy/` (reference only, never imported, deleted in Phase 4).

## Commands (run before and after every change)
- Agent: `cd apps/agent-service && uv sync --frozen --all-extras && uv run poe check` (ruff, mypy, import-linter,
  pytest; no network).
- Loop in process (from Phase 3): `uv run shop-agent simulate loop --scenario v1-parity --auto-approve --assert`;
  growth (from Phase 7): `uv run shop-agent simulate growth --scenario data/growth/scenarios/q4.yaml --days 30 --assert`.
- Server + Studio: `uv run poe dev`. Local model check (from Phase 1): `uv run shop-agent doctor --profile local --live`.
- Web: `cd apps/web-ecommerce && corepack enable && yarn lint && yarn type-check && yarn build` (`yarn test` from
  Phase 4).
- Phase gates: `python scripts/gate.py --phase <n>`.

## Invariants (each is proved by a named test; never weaken the test)
1. No shop or outside-world change without a recorded decision: a human approval (the web signs a single-use approval
   grant bound to the exact endpoint, body and idempotency key) or the autonomy policy for that action's capability and
   risk tier. Protective actions (pause, end, delete, decrease) are always allowed, audited and notified.
2. Eyes and hands: reads are `analytics` views as the read-only `ci_reader`; every write is the web Agent API with an
   `Idempotency-Key`, revertible. Platform tokens (Facebook, Meta/Google/TikTok Ads) live only in the web app.
3. Numbers come from code. Detect, prioritize, validate, act, measure are LLM-free; every VND amount, quantity and
   estimate is computed in `domain/`. The model chooses among options and parameters inside limits it can read;
   `validate` builds the complete request bodies and recomputes everything; copy must quote exactly the executed numbers.
4. Limits are layered: `domain` policies (validate and again in the tool) -> web hard caps, budget ledger, approval
   grants, kill switch -> platform spend caps. Never raise a limit in the same change that adds a capability.
5. Provider-agnostic LLM: only `shop_agent/llm.py` imports provider packages; get models with `chat_model(role)`.
   Tests use the scripted model and never call a real LLM; evals are the only real-model tests.
6. Untrusted text (customer text, scraped pages, competitor copy) is data: delimited in prompts, read only by agents
   without write tools.
7. Layering `ops > graphs > wiring > agents > tools > adapters > domain` is enforced by import-linter
   (`tests/architecture`). `domain` imports no LangChain/LangGraph/DB/HTTP library (pydantic is allowed).
8. Money is whole VND integers everywhere. Text for people is Vietnamese (`AGENT_LANGUAGE`); code, prompts, skills English.
9. Contract first: an `ActionSpec` body is exactly the Agent API request body. Change
   `packages/contracts/openapi/web-agent-api.yaml` and `packages/contracts/test-vectors/` in the same change; both the
   web tests and the agent's FakeShop assert the vectors.

## Conventions
- New capability = the recipe in `.claude/skills/` (add-agent-action, add-playbook, add-detector, add-trigger,
  add-shop-tool, add-knowledge-source, add-market-source, add-ad-platform, add-subagent, run-evals, debug-thread).
  Graphs, gateway and console do not change for a new capability.
- Tools get dependencies from `ToolRuntime.context` or `tools/deps.py`; concrete wiring lives in `shop_agent/wiring.py`.
- Every new Sequelize model defines `static async seedData()`; every column is declared on its model; migrations are
  idempotent.
- Unit tests do no I/O (FakeShop, FakeWorld, scripted model, in-memory saver/store). DB tests are `-m db`.
- Look up LangChain / LangGraph / Deep Agents APIs in the `docs-langchain` and `reference-langchain` MCP servers before
  writing them; versions are pinned in `apps/agent-service/uv.lock`.

## Model routing
- Opus (`agent-architect`): graphs and state, approval/autonomy/tiers, idempotency and the saga, budget ledger and
  grants, brand safety, estimators, measurement, prompts and playbooks, cross-cutting refactors.
- Sonnet (`agent-builder`): tools and adapters that follow an existing pattern, web pages and services, tests, docs.
