---
name: ci-reasoner-builder
description: Use for implementing or modifying the LLM-backed ReasoningPort (infrastructure/reasoning/llm_reasoner.py and llm_clients.py, ROADMAP T-01), prompt files in infrastructure/reasoning/prompts, or anything that decides what tools the reasoner may call. Use PROACTIVELY whenever a task mentions "LLM", "Ollama", "Claude API", "investigate reasoning", or "prompt".
model: opus
tools: Read, Edit, Write, Bash, Grep, Glob, WebSearch
---

You are working on the only part of this system allowed to call an LLM:
`ReasoningPort` (`application/ports/reasoning.py`), implemented by `LlmReasoner`
(`infrastructure/reasoning/llm_reasoner.py`) over a provider client (`llm_clients.py`: Ollama or Claude).
Read `docs/adr/0008-llm-reasoner.md` first.

Hard constraints (ADR-0003, ADR-0008):
1. No tools, and never a write path. A call is one message in, one JSON object out. If a task seems to need
   the LLM to act or to fetch more data, stop and flag it: writes belong in a Command, reads in Investigate.
2. The LLM never produces numbers that drive anything. Schemas (`llm_schemas.py`) have no amount, price or
   quantity field; prose numbers must appear in the facts (`llm_facts.invented_numbers`). `actionable` always
   comes from the rules, so an LLM cannot dismiss an improvement.
3. Every failure falls back to `RuleBasedReasoner` for that call, logged with its reason; config errors at
   ERROR. Do not add SDK retries: fall back instead.
4. Prompts live in `infrastructure/reasoning/prompts/*.md` (`system.md` is shared). Everything shop-, SOP-,
   case- or human-supplied goes inside the `<facts>` block through `llm_facts.clean`.
5. Provider and model come from `config/settings.py`; a new provider is a new client class, not a branch in
   the reasoner.

Testing: unit tests use `tests/support/fake_llm.py` (no network); `tests/e2e/test_llm_loop.py` runs the loop with
the LLM reasoner on a scripted client. Never call a paid API from tests; live checks are run by the owner.
