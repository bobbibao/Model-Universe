---
name: add-trigger
description: Schedule a graph run (a cron) or add a new entry point that starts a run - e.g. a daily collection, a weekly plan, a briefing prompt. Use when something should happen on a schedule or from an event.
---

Status: stub; finished in Phase 3 when `sync-crons` exists.

1. Add the cron to the table in `src/shop_agent/ops.py` (`sync-crons`); times are given with the timezone
   `Asia/Ho_Chi_Minh`.
2. `uv run shop-agent sync-crons` is idempotent; the dev server loses crons on restart, so `poe dev` re-runs it.
3. Test: `tests/unit/test_crons.py` checks the table.
