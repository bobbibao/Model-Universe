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
2. `docs/adr/` - the six decisions that shape the codebase, and why.
3. `docs/ROADMAP.md` - what's fully implemented (the whole loop, tested against `FakeShop`) vs.
   stubbed (Postgres, the LLM reasoner, real shop reads, Zalo verification, ...) with task ids.
4. `CLAUDE.md` - instructions for Claude Code in this repo, including which subagent/model to
   use for which kind of change.

## Layout

```
apps/web              Next.js e-commerce (bring your existing app here, unchanged)
apps/agent-service     Python: Clean Architecture (domain / application / infrastructure / interfaces)
packages/contracts     OpenAPI both directions + the webhook event schema
infra/                 docker-compose (Postgres + pgvector)
.claude/               Claude Code subagents and skills for this repo
docs/                  ARCHITECTURE.md, adr/, ROADMAP.md, NOTIFICATIONS.md
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
