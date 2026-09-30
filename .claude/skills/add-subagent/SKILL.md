---
name: add-subagent
description: Add a subagent to the copilot (assistant deep agent) for context isolation or privilege separation. Use when a task needs its own context or must read untrusted text without write tools.
---

Status: stub; finished in Phase 8.

1. Define it in `src/shop_agent/agents/` with its own tool list; a subagent that reads untrusted text gets no write tool.
2. Register it in `graphs/assistant.py` (`subagents=`).
3. Test its tool list in `tests/graphs/test_assistant.py`.
