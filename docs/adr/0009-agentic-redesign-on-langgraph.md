# ADR-0009: Rebuild the agent service on LangGraph, with a tool-using agent and approval by interrupt

**Status:** accepted on 2026-09-30 (owner decisions D1-D3). The full design is `docs/ARCHITECTURE.md`; the implementation
plan is `docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`. Follow-up decisions: ADR-0010 to ADR-0014.

**Context:** the owner finds `apps/agent-service` too complex for what it does (about 7,100 lines for one loop over
two signal kinds), wants the LLM deeply involved in the shop with many tools, wants new agent capabilities (marketing
posts and more) to be cheap to add, and wants only established, widely used building blocks. ADR-0005 and ADR-0008
chose the opposite on purpose: no workflow-engine dependency, and an LLM without tools that only writes prose. Most of
the code exists because of those two choices: a hand-written workflow engine, state machine, persistence,
question/answer model, LLM clients and notification system.

**Decision:**

- The agent service becomes three LangGraph graphs on a standard Agent Server: `improvement` (the closed loop, one
  thread per opportunity), `monitor` (the scheduled tick) and `assistant` (a Deep Agents copilot with skills,
  subagents and memory). Persistence, scheduling, streaming and the HTTP API come from the runtime.
- Waiting for a person is `interrupt()` and a checkpoint. A decision is `Command(resume=...)`: approve, edit, reject
  or respond, for a proposal in the loop and for a tool call in the copilot.
- The LLM investigates with tools (curated metrics, read-only SQL, estimators, knowledge and case search) and
  proposes concrete actions. Writes still go only through the web app's Agent API, with an `Idempotency-Key`, and
  stay revertible.
- Knowledge (SOPs, policies, catalog) is retrieved from pgvector; cases and learned preferences live in the LangGraph
  Store with a semantic index.
- The web app talks to the agent through the Agent Server API and the official SDKs, behind one authenticated gateway
  route. The bespoke REST API, the events webhook and the agent-side notification channels are removed.

**What happens to the earlier decisions:**

| ADR | In v2 |
|---|---|
| 0001 monorepo, two apps | kept |
| 0002 read-only reads, writes through the web API | kept unchanged |
| 0003 the LLM proposes, never acts | restated: no write without an approved, checkpointed call. The model may propose a concrete write; only a human decision or the bounded autonomy policy lets it run, and code limits apply either way |
| 0004 deterministic where possible | restated: Detect, Act and Measure stay LLM-free; every number shown to a person is computed by a tool. The model now chooses strategies and parameters, inside limits |
| 0005 Ask is durable state, not a paused process | superseded in mechanism, kept in intent: the durable state is a LangGraph checkpoint instead of our own rows and state machine |
| 0006 bounded autonomy | kept, implemented as the approval middleware's `when` predicate |
| 0007 money format in domain text | removed together with the internal money unit: VND everywhere |
| 0008 the LLM explains, the rules decide | superseded: the LLM has tools and proposes; rules limit and people decide. There is no rule-based reasoner; resilience is retries, a fallback model and a durable retry of the run |

**Consequences:**

- Far less code to own, and the remaining code is the part that is ours: domain math, policies, tools, playbooks.
- The loop needs a capable tool-calling model. A 3B local model is no longer enough, and there is a running cost.
- New dependencies that move fast (LangGraph, LangChain, Deep Agents) and a runtime whose production use has licence
  implications. The design keeps to a portable subset of the Agent Server API so the server can be swapped
  (`docs/ARCHITECTURE.md` section 17, D4).
- `CLAUDE.md`'s non-negotiable rules are replaced by the invariants in `docs/ARCHITECTURE.md` section 11, each of
  them proved by a test instead of by the absence of tools.
- The v1 agent database and its data are dropped. There is no real data yet.
