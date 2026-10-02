---
name: run-evals
description: Run the agent eval suites (smoke, loop, growth, copilot) against a model profile, compare with the stored baseline, and update the baseline deliberately. Use after changing prompts, playbooks (skills/), agents or model profiles, or to compare models.
---

Status: done. Suites: smoke, loop, growth, copilot; `--suite all` runs every one.

1. `cd apps/agent-service`.
2. Scripted run (no network, what `scripts/gate.py` runs): `uv run python -m evals.runner --suite <suite> --profile scripted --gate`.
3. Local model: `uv run poe eval-local --suite <suite>` (needs Ollama; see `docs/LOCAL_LLM.md`).
4. Hosted model: `uv run python -m evals.runner --suite <suite> --profile anthropic --gate` (needs `ANTHROPIC_API_KEY`).
5. Results land in `evals/results/`; the gate fails if the pass rate drops more than 5 points below
   `evals/baselines/<suite>-<profile>.json` or any case marked `critical` fails.
6. Update a baseline only on purpose, in its own commit: `--update-baseline`.
7. Compare models (the bake-off): `uv run python -m evals.runner --suite all --profile anthropic openai google
   local-large --report evals/reports/bakeoff.md` writes one table (suite by profile) and the failed cases.
