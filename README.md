# Model Universe

A Gundam/Gunpla commerce monorepo: the Model Universe Next.js/Express storefront and operations workspaces, plus a Python agent on LangGraph that improves the shop through recorded decisions.

```
Detect -> Investigate -> Ask -> Improve -> Act -> Measure -> Learn
```

The agent watches operational, sales and market data, investigates with tools (metrics, read-only SQL, estimators,
knowledge and past cases), proposes concrete actions (discounts, coupons, Facebook posts, ads on Meta, Google and
TikTok, staff tasks), asks a person or its bounded autonomy policy, acts only through the web app's Agent API, measures
the result against the revenue goal, and learns from every outcome.

The v2 agent is built phase by phase (`docs/ROADMAP.md`); v1 was removed in Phase 4 (its logs are in `docs/history/`).

Current commerce implementation, owner decisions and launch gates: [Model Universe handoff](apps/web-ecommerce/docs/model-universe/implementation-handoff.md) and [release verification](apps/web-ecommerce/docs/model-universe/release-verification.md). Implemented features and disposable test approvals do not establish production readiness.

## Start here

1. `docs/ARCHITECTURE.md` - the design: three LangGraph graphs on an Agent Server, tools, human-in-the-loop by
   `interrupt()`, memory and knowledge, the safety model.
2. `docs/GROWTH_AGENT.md` - the growth agent: decision engine, data sources, integrations, guardrails, legal,
   measurement.
3. `docs/adr/` - the decisions (ADR-0009 to 0014 for v2).
4. `docs/ROADMAP.md` - phase status; the plan is `docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`.
5. `docs/RUNBOOK.md` - operations: kill switch, pausing ads, reverting, the autonomy ramp, rotating secrets, the
   production runtime (Aegra).
6. `CLAUDE.md` - instructions for Claude Code in this repo, including which subagent and model to use.

## Layout

```
apps/web-ecommerce   Next.js + Express e-commerce, the agent console and the Agent API (/api/agent/v1)
apps/agent-service   Python 3.12, LangGraph (package shop_agent)
packages/contracts   OpenAPI for the Agent API, shared test vectors
infra/               docker-compose (Postgres 18 + pgvector, Agent Server, web; profile prod-like: Aegra + Redis;
                     secrets from infra/.env), sql/ (roles)
scripts/             gate.py (phase acceptance gates), dev helpers
.claude/             Claude Code subagents and skills for this repo
docs/                architecture, growth agent, demo guide, runbook, ADRs, roadmap, plans
```

## Try it (no web app, no database, no API key needed)

```bash
cd apps/agent-service
uv sync --frozen --all-extras
uv run poe check        # lint, types, layering, tests
uv run poe dev          # the Agent Server on http://localhost:2024 (LangGraph Studio can connect to it)
```

The whole loop with the web shop and a browser: `docs/DEMO.md` (compose `--profile e2e`, or without Docker).

`python scripts/gate.py --phase <n>` runs the acceptance checks of every phase up to `n`.
