---
name: add-playbook
description: Add or change a runtime playbook (apps/agent-service/skills/<name>/SKILL.md) that tells an agent how to handle one kind of opportunity - which tools to use, what to propose, how success is measured. Use when the agent should handle a new kind of situation or handle one differently.
---

Status: stub; finished in Phase 3 when the first playbooks exist.

1. Write `apps/agent-service/skills/<name>/SKILL.md` (frontmatter `name` = folder, `description`).
2. Point the kind's `KindSpec.playbook` at it (`agents/kinds.py`).
3. Add or update eval scenarios in `evals/suites/<suite>/` and run the `run-evals` recipe.
