---
name: add-playbook
description: Add or change a runtime playbook (apps/agent-service/skills/<name>/SKILL.md) that tells an agent how to handle one kind of opportunity - which tools to use, what to propose, how success is measured. Use when the agent should handle a new kind of situation or handle one differently.
---

Paths are relative to `apps/agent-service/`. Examples: `skills/dead-stock/SKILL.md`, `skills/high-returns/SKILL.md`.

1. Write `skills/<name>/SKILL.md` in English (Agent Skills format: frontmatter `name` equal to the folder,
   `description` of at most 1024 characters, checked by `tests/architecture/test_skills_format.py`). Sections:
   When (the trigger, citing the SOP), Investigate (which tools, in order, and what to look for), Propose (the
   strategies from `domain/options.py` it may choose, always with `do_nothing`), Measured by.
2. Never put numbers the agent should use in the playbook: amounts come from the menu and the estimator tools, and
   `validate` recomputes every option. Limits are stated to the agent by the investigate step, not by the playbook.
3. Point the kind's `KindSpec.playbook` at it with `load_playbook("<name>")` in `src/shop_agent/agents/kinds.py`
   (read once at import). The prompt is `src/shop_agent/agents/prompts/investigate.md` + the playbook.
4. Evals: add or update scenarios in `evals/suites/loop/scenarios.yaml` (growth kinds: `evals/suites/growth/`) and run
   the `run-evals` recipe on `scripted` and, when you can, a real profile.
