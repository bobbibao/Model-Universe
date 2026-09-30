# ADR-0012: Engineering baseline: uv, layering by import-linter, gates, scripted model, evals, Langfuse

**Status:** accepted on 2026-09-30.

**Decision:**

- Python: `uv` with a committed `uv.lock`, Python 3.12, `poethepoet` tasks (`uv run poe check`); ruff, mypy strict,
  import-linter contracts run by `tests/architecture/test_layering.py`; pytest markers `db`, `server`, `eval`, `live`,
  `runtime`, all off by default.
- Web: Jest (ts-jest, keeps decorator metadata for sequelize-typescript), supertest and nock; `yarn test` and
  `yarn test:db`.
- Contracts first: `packages/contracts/openapi/web-agent-api.yaml` (Redocly lint) and shared test vectors
  (`packages/contracts/test-vectors/`) that both the web tests and the agent's FakeShop assert.
- Gates: `scripts/gate.py --phase N` is the single list of acceptance commands; GitHub Actions runs the same checks.
- Tests never call a real model (scripted model); evals (`apps/agent-service/evals/`) gate prompt, skill and model
  changes against per-profile baselines.
- Tracing is Langfuse (open source, framework-agnostic, free cloud tier, self-hostable later); LangSmith is an optional
  development tool only. LLM-free ticks are not traced; customer text is masked.
- Rollout flags are typed settings (`FF_*`); runtime business controls live in the web `agent_setting` table.
