# ADR-0013: Production runtime: Aegra

**Status:** accepted on 2026-09-30 (decision Q1 of the v2 plan). Resolves `docs/ARCHITECTURE.md` section 17 D4.

**Context:** `langgraph dev` is for development and testing. Running the LangGraph Agent Server in production needs a
paid LangSmith Deployment plan or an enterprise licence. The graphs use only the portable API subset (threads, runs,
interrupts, store, crons, custom auth).

**Decision:** production runs on **Aegra** (Apache-2.0), a self-hosted server that exposes the same API used by the
LangGraph SDKs (threads, runs, human-in-the-loop resume, crons, and a semantic store on pgvector), with Postgres
persistence. It is exercised by the e2e stack from Phase 4 and hardened in Phase 9. `langgraph dev` stays the local
development server (Studio, `server` test tier). Fallback, only if Aegra fails the `runtime` tests with no fix:
LangSmith Deployment; the graphs do not change.

**Gaps** found during Phase 4 and Phase 9, with how each is handled. Checked first on 2026-09-30 against
`aegra-cli`/`aegra-api` 0.10.7, then on 2026-10-02 against 0.10.8 (pinned as the `runtime` extra) with
`apps/agent-service/aegra.json`, Postgres 16, Redis and the scripted model:

| Gap | Effect | Status |
|---|---|---|
| Aegra calls the `authenticate` handler with the request headers as its first argument; langgraph-api injects arguments by name | a handler written as `authenticate(authorization)` receives a dict | **fixed**: `shop_agent/auth.py` takes `headers` (a name both runtimes support) |
| No in-process SDK loopback (`get_client()` without a URL needs langgraph-api's ASGI transport) | `monitor` cannot open threads | **worked around**: `AGENT_SERVER_URL` (agent settings) points the launcher at the server itself |
| Graph entries must be plain `path:variable` strings (no `{"path", "description"}` objects) | startup fails with langgraph.json's form | **worked around**: `aegra.json` lists plain paths |
| The store index passes `embed` to `AsyncPostgresStore`, which reads a string as `provider:model` | our embeddings function (`knowledge/embeddings.py:aembed`) cannot be loaded | **fixed** (P9): every hosted and local profile embeds with Ollama's `bge-m3`, so `aegra.json` names it (`ollama:bge-m3`, the same vectors as `aembed`) and the server gets `OLLAMA_HOST`. The scripted profile has no such model: scripted runs on Aegra use a copy of `aegra.json` without the index (cases unranked), as the `runtime` tests do |
| Threads, runs and crons are scoped to the caller's identity (`user_id == user.identity`), whatever the auth handlers allow | threads opened by `monitor` (`system`) were invisible to admins: the shared inbox could not work | **fixed** (P9): the shop is one tenant, so every actor authenticates as the identity `shop`; the token's subject is the `display_name` and the role stays a permission. Who approved a change is in the approval grant and the web's audit |
| Threads carry no `values` and thread search ignores a `values` filter (found in P9) | the console's lists (summaries, stages, Impact) and the agent's approval-expiry sweep read nothing | **fixed** (P9): both read a thread's values from its state when the search result has none (`AgentServer.ts`, `SdkLauncher.stale_reviews`) |
| A new cron runs at once unless it is created disabled (found in P9) | each `sync-crons` that creates a cron would collect, plan the week and brief off-schedule | **fixed** (P9): `sync-crons` creates each cron disabled and then enables it; on both runtimes it fires on its schedule only |
| Without Redis (`REDIS_BROKER_ENABLED=false`) a run whose server died is lost | a crash during Act leaves the thread unfinished | **configured**: the prod-like runtime runs with Redis; a run whose lease expired is re-queued and resumes from its last checkpoint |
| `durability="sync"` fails in LangGraph 1.2.12 when a node runs an agent compiled with `checkpointer=False` (`_put_checkpoint_fut` missing) | every investigation fails | **avoided**: Aegra keeps LangGraph's default (`async`). Exactly-once does not depend on it: a resumed Act resends its steps with the same idempotency keys and the web answers them as replays |

**Verified on Aegra** (2026-10-02): the `runtime` test tier (`tests/runtime`, Postgres as the agent's NOSUPERUSER role,
Redis, the OpenAPI-validated web double): the server is killed in Act right after the first step reached the shop and,
after a restart, the run is recovered and every step is applied exactly once; `sync-crons` leaves four enabled crons
and nothing runs before its schedule. The browser demo `@demo` passed its 4 tests against the production web build and
Aegra on local processes (the same run as Phase 4's on `langgraph dev`). The compose e2e stack still runs
`langgraph dev` (Studio, scripted model); the `prod-like` profile runs Aegra.
