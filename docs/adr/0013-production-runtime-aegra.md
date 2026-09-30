# ADR-0013: Production runtime: Aegra

**Status:** accepted on 2026-09-30 (decision Q1 of the v2 plan). Resolves `docs/ARCHITECTURE_V2.md` section 17 D4.

**Context:** `langgraph dev` is for development and testing. Running the LangGraph Agent Server in production needs a
paid LangSmith Deployment plan or an enterprise licence. The graphs use only the portable API subset (threads, runs,
interrupts, store, crons, custom auth).

**Decision:** production runs on **Aegra** (Apache-2.0), a self-hosted server that exposes the same API used by the
LangGraph SDKs (threads, runs, human-in-the-loop resume, crons, and a semantic store on pgvector), with Postgres
persistence. It is exercised by the e2e stack from Phase 4 and hardened in Phase 9. `langgraph dev` stays the local
development server (Studio, `server` test tier). Fallback, only if Aegra fails the `runtime` tests with no fix:
LangSmith Deployment; the graphs do not change.

**Gaps found during Phase 4** are recorded below with their workaround.

- (none yet)
