---
name: add-trigger
description: Schedule a graph run (a cron) or add a new entry point that starts a run - e.g. a daily collection, a weekly plan, a briefing prompt. Use when something should happen on a schedule or from an event.
---

Paths are relative to `apps/agent-service/`.

1. A scheduled run: add a `CronSpec(name, assistant_id, schedule, dev_schedule=None)` to `CRONS` in
   `src/shop_agent/ops.py`. Schedules are UTC cron strings; convert from Asia/Ho_Chi_Minh (UTC+7, no daylight
   saving): 08:45 local = `45 1 * * *`. A `dev_schedule` may run more often locally (`APP_ENV=dev`).
2. `uv run shop-agent sync-crons [--url ...]` makes the server match `CRONS` (idempotent; it only touches crons it
   created, tagged `metadata.managed_by = shop-agent`). The dev server keeps crons in memory: `uv run poe dev` runs
   `sync-crons` once the server is healthy, and the e2e `ingest` step runs it after start.
3. An event from the web (a button, a webhook) starts a run through the web gateway's allowlisted routes (Phase 4),
   never by calling a graph directly.
4. Tests: `tests/unit/test_crons.py` checks the table (known graph, five fields) and the sync logic;
   `tests/server/test_crons_on_dev_server.py` runs it against `langgraph dev`.
