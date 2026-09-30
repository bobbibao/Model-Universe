# CLAUDE.md - instructions for Claude Code in this repo

This is a monorepo: `apps/web-ecommerce` (existing Next.js e-commerce, keep its structure as-is; its own
conventions are in `apps/web-ecommerce/docs/PROJECT_OVERVIEW.md`) and
`apps/agent-service` (Python, Clean Architecture) implementing the SME Continuous Improvement
Agent. Read `docs/ARCHITECTURE.md` first, then `docs/ROADMAP.md` for what is stubbed vs. real.

## Model routing

- **Opus** (or the strongest model available): anything touching `domain/` or `application/`
  business rules, the LangGraph reasoner (`docs/ROADMAP.md` T-01), the Postgres repository
  (T-02), cross-cutting refactors, and anything on the guardrail/approval/idempotency path.
  Mistakes here are expensive (money, stock, trust). Use the `ci-domain-architect` and
  `ci-reasoner-builder` subagents in `.claude/agents/` for this work.
- **Sonnet** (or a faster/cheaper model): infrastructure adapters that follow an existing
  pattern (a new notification channel, a new detector, a new strategy), tests, docs, CLI/UI
  glue, and the Next.js side. Use the `ci-adapter-builder` subagent.
- Skills in `.claude/skills/` encode the house patterns (add a strategy, add a channel, wire a
  new port) so routine work doesn't need Opus to get the shape right.

## Non-negotiable rules (see `docs/adr/`)

1. **The LLM only proposes, never acts.** `ReasoningPort` implementations have no write tool.
   `Improve` produces a hash-protected `ActionPlan`; `Act` only runs it after `Human Approval`
   (or the `AUTO_LOW_RISK` autonomy policy) and re-verifies the hash before touching anything.
2. **Reads are read-only; writes go through the web app's Agent API**, always with an
   `Idempotency-Key`, always compensable (`ActionCommand.compensate`).
3. **Deterministic where possible.** Detect, Act, Measure and every dollar/inventory number in
   `domain/strategies/*` are plain Python, no LLM. Only Investigate/Ask/Learn use the reasoner.
4. **Layering is enforced by a test**, not just convention: `tests/architecture/test_layering.py`
   fails the build if `domain` imports `application`/`infrastructure`, or `application` imports
   `infrastructure`. Run it after any refactor.
5. **The loop is Detect -> Investigate -> Ask -> Improve -> Act -> Measure -> Learn.** Every
   status in `domain/models/improvement.py::ImprovementStatus` maps to exactly one phase; do not
   add a shortcut that skips Ask for a normal-risk change.

## Before you start any task

1. `cd apps/agent-service && pip install -e ".[dev]"`.
2. `pytest -q` — should be green. `pytest tests/architecture` specifically checks layering.
3. `python -m ci_agent.interfaces.cli simulate --auto-approve` — runs the whole loop against
   `FakeShop` in-process. This is the fastest way to see your change working end-to-end.
4. Check `docs/ROADMAP.md` — several adapters are intentionally `NotImplementedError` stubs with
   a task id. Don't silently implement them differently from what the docstring specifies; if the
   spec is wrong, fix the docstring/ROADMAP in the same change.

## Conventions

- One port = one `Protocol` in `application/ports/`. One adapter = one class in
  `infrastructure/`, named `<Tech><Port>Adapter` or similar. Wire it in
  `bootstrap/container.py`, nowhere else.
- New improvement strategy: add a file in `domain/strategies/`, decorate with
  `@register_strategy`, import it from `domain/strategies/__init__.py`. See
  `.claude/skills/add-strategy/SKILL.md`.
- New notification channel: implement `NotificationChannelPort` in `infrastructure/notifications/`,
  register it in `bootstrap/container.py`'s channel list. See `.claude/skills/add-channel/SKILL.md`.
- Money in agent-written text goes through `domain/models/money.py::MoneyFormat` (ADR-0007: a formatting-only
  exception; never use it to compute anything, never change a rule/threshold/constant under its cover).
- Money/quantity numbers never come from an LLM. If you're tempted to have the reasoner "just
  estimate" a dollar figure, put that logic in a strategy instead.
- Tests: unit tests must not do I/O. Use `tests/support/factories.py` for fixtures. Use
  `infrastructure/persistence/in_memory.py` and `infrastructure/shop/fake_shop.py` for anything
  that would otherwise need Postgres or a real shop.
