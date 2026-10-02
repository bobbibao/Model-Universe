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

**Gaps found during Phase 4** are recorded below with their workaround.

Checked on 2026-09-30 against `aegra-cli`/`aegra-api` 0.10.7 with `apps/agent-service/aegra.json`, Postgres 16 and the
scripted model (the graphs, the custom auth, a `monitor` run, the review resume):

| Gap | Effect | Status |
|---|---|---|
| Aegra calls the `authenticate` handler with the request headers as its first argument; langgraph-api injects arguments by name | a handler written as `authenticate(authorization)` receives a dict | **fixed**: `shop_agent/auth.py` takes `headers` (a name both runtimes support) |
| No in-process SDK loopback (`get_client()` without a URL needs langgraph-api's ASGI transport) | `monitor` cannot open threads | **worked around**: `AGENT_SERVER_URL` (agent settings) points the launcher at the server itself |
| Graph entries must be plain `path:variable` strings (no `{"path", "description"}` objects) | startup fails with langgraph.json's form | **worked around**: `aegra.json` lists plain paths |
| The store index passes `embed` to `AsyncPostgresStore`, which reads a string as `provider:model` | our embeddings function (`knowledge/embeddings.py:aembed`, needed for the `scripted` and Ollama profiles) cannot be loaded | **open**: `aegra.json` has no store index, so `search_cases` returns cases unranked on Aegra. Phase 9 task 9.1 |
| Threads are always scoped to the caller's identity (`thread.user_id == user.identity`), whatever the auth handlers allow | threads opened by `monitor` (`system`) are invisible to admins: the shared inbox cannot work | **open, blocks e2e on Aegra**: Phase 9 task 9.1 (e.g. one tenant identity for every actor of the shop, with the person kept in the token's other claims). Until then the e2e stack runs on `langgraph dev`, as this ADR's P4 clause allows |
