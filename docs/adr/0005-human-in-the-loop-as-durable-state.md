# ADR-0005: "Ask" is a durable state, not a paused process

**Decision:** waiting for a human is `ImprovementStatus.AWAITING_HUMAN`, persisted like any
other state. There is no in-memory pause, thread block, or long-lived process waiting for an
answer. `WorkflowCoordinator.advance` is idempotent and safe to call repeatedly; a scheduler
tick or a submitted answer both just call it.

**Why:** approvals can take hours or days. A workflow engine that models this as a blocked
process either needs an external durable-execution system (Temporal, LangGraph's `interrupt` +
a checkpointer) or it leaks memory and dies on redeploy. Modelling it as ordinary rows in
Postgres (`ci.improvements`) is simpler to reason about, and is exactly what Clean Architecture
without a workflow-engine dependency looks like.

**Consequence:** every phase transition must be resumable from just the persisted `Improvement`
and the event that triggered it (a tick, or an answer). No phase may depend on in-process state
from a previous phase call.
