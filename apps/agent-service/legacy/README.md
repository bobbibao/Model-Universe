# Legacy v1 agent service (reference only)

This is the v1 `ci_agent` package, frozen at the start of the v2 rebuild (`docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`, Phase 0).

- It is **not installed, tested or run**. No tooling (ruff, mypy, pytest, import-linter, pre-commit) looks at this folder.
- v2 code must never import `ci_agent` (enforced by import-linter).
- It is read only to port the domain math, the read adapter, the Agent API client and the actor-token checks.
- It is deleted in Phase 4, once the demo runs on v2.
