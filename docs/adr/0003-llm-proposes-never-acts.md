# ADR-0003: The LLM only proposes, it never acts

**Status:** superseded by ADR-0009 and ADR-0011 on 2026-09-30. Restated as "no write without an approved, checkpointed call" (docs/ARCHITECTURE_V2.md section 11).

**Decision:** the reasoner (`ReasoningPort`) has read-only tools. Improve produces an
`ActionPlan` with a schema and a content hash. Act only runs when `status == PLANNED`
(i.e. a human approved a `Directive`, or the low-risk autonomy policy did) and the plan hash
still matches what was approved.

**Why:** the safety boundary must live in the architecture, not in a prompt. Prompt injection
from customer-supplied data (feedback text, return reasons) must never be able to reach a
write path, no matter how the reasoning step is implemented.

**Consequence:** adding a new action type means adding a `Command` + a web endpoint, never a
new tool for the LLM.
