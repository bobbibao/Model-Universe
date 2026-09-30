---
name: add-agent-action
description: Add a new write the agent can make to the shop or the outside world (a new Agent API endpoint plus its ActionSpec, tool, limits, risk tier and inbox renderer). Use when the agent must be able to change something new.
---

Status: stub; finished in Phase 6.

1. Contract first: the endpoint in `packages/contracts/openapi/web-agent-api.yaml` and test vectors in
   `packages/contracts/test-vectors/`.
2. Web: handler in `AgentActionService` (idempotent, revertible, capped), write class in `AgentPolicyService`.
3. Agent: `ActionSpec` in `domain/actions.py` (body == request body), limits in `domain/policies` or
   `domain/growth/policies.py`, tier in `domain/growth/tiers.py`, `ShopWriter` + `shop_api` + FakeShop method.
4. Console: an inbox renderer with the action's `editable_fields`.
5. Tests: web Jest (replay, 409, caps, revert, grant), agent contract tests (vectors, schema parity).
