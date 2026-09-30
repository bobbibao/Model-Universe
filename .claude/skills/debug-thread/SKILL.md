---
name: debug-thread
description: Inspect what happened in one agent thread - its state, checkpoint history, interrupts and the actions it sent - on the dev server or in tests. Use when a proposal, approval or action looks wrong.
---

Status: stub; finished in Phase 3.

1. Dev server: `uv run poe dev`, then `client.threads.get_state(thread_id)` and `client.threads.get_history(thread_id)`
   with `langgraph_sdk.get_client(url="http://localhost:2024")`, or open the thread in LangGraph Studio.
2. In process: `uv run shop-agent simulate loop ...` prints each thread's stage and actions.
3. The web side: the `agent_action` row for the idempotency key shows the stored response and the approval provenance.
