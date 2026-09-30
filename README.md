# SME Continuous Improvement Platform

A monorepo: an existing Next.js e-commerce app, plus a Python agent that runs a closed
improvement loop against it.

```
Detect -> Investigate -> Ask -> Improve -> Act -> Measure -> Learn
```

The agent watches operational data (stock, returns, sales), investigates anomalies against
SOPs and past cases, asks a human for a bounded decision (web, Telegram, Zalo or email), acts
through the web app's own API once approved, measures the before/after KPI impact, and stores
the outcome - including rejections and failures - as a reusable case.

## Start here

1. `docs/ARCHITECTURE.md` - the full design: the loop, the aggregate's state machine, layering,
   design patterns, and the web integration contract.
2. `docs/adr/` - the decisions that shape the codebase (ADR-0001 to 0008), and why.
3. `docs/ROADMAP.md` - what is done (the whole loop against the real web shop, Postgres, the LLM reasoner, the
   scheduler) vs. open (Zalo, pgvector, outbox, recipients from the web), with task ids and follow-ups.
   `docs/DEMO.md` - setup and a step-by-step demo on one Windows machine.
4. `CLAUDE.md` - instructions for Claude Code in this repo, including which subagent/model to
   use for which kind of change.

## Layout

```
apps/web-ecommerce   Next.js + Express e-commerce, plus the CI Console (/admin/ci) and the Agent API
apps/agent-service     Python: Clean Architecture (domain / application / infrastructure / interfaces)
packages/contracts     OpenAPI both directions + the webhook event schema
infra/                 docker-compose (Postgres 18, agent, web; secrets from infra/.env), sql/ (roles)
.claude/               Claude Code subagents and skills for this repo
docs/                  ARCHITECTURE.md, adr/, ROADMAP.md, DEMO.md, NOTIFICATIONS.md, AUTONOMOUS_LOG.md
```

## Try it now (no web app, no database, no API key needed)

```bash
cd apps/agent-service
pip install -e ".[dev]"
pytest -q
python -m ci_agent.interfaces.cli simulate --auto-approve --rounds 2
```

This runs the full loop against `FakeShop`, an in-memory shop seeded with ~500 stock items and
~100 returns, and prints each phase as it happens.
