---
name: debug-thread
description: Inspect what happened in one agent thread - its state, checkpoint history, interrupts and the actions it sent - on the dev server or in tests. Use when a proposal, approval or action looks wrong.
---

Paths are relative to `apps/agent-service/`.

1. In process (fastest): `uv run shop-agent simulate loop --scenario v1-parity --auto-approve` prints every thread's
   kind, stage, outcome and verdict; `--assert` checks the invariants. In a test, use `tests/graphs/conftest.py`
   (`World`): `await world.values()` is the thread state, `world.review(result)` the pending review payload.
2. Dev server: `uv run poe dev`, then with `langgraph_sdk.get_client(url="http://localhost:2024")`:
   - `threads.search(status="interrupted", metadata={"graph": "improvement"})`: the inbox;
   - `threads.get_state(id)`: `values` (stage, options, decision, approved actions, steps, measurement, outcome)
     and `tasks[0].interrupts[0].value` (the review payload, with the exact bodies and idempotency keys);
   - `threads.get_history(id)`: every checkpoint; `threads.search(status="error")`: runs the next tick retries.
   Or open the thread in LangGraph Studio. The dev runtime persists to `.langgraph_api/` (delete it to start clean).
3. Store: `("signals",)` keyed by fingerprint (which thread, generation, closed_at), `("followups",)` keyed by thread
   id (due_at), `("cases", kind)` keyed by thread id (the case text and lessons).
4. Writes: each step's idempotency key is `{thread_id}:{option_id}:{n}` (copilot: `{thread_id}:{tool_call_id}`); on
   the web side the `agent_action` row for that key holds the stored response and, from Phase 6, the grant and
   approver. A revert uses `{key}:revert`.
5. Scripted runs: the answers come from `src/shop_agent/testing/scripts/*.yaml` keyed by `script_key`
   (`improvement.investigate.<kind>`, `improvement.learn`); an unknown key raises an error naming it.
