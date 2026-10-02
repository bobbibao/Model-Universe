---
name: add-agent-action
description: Add a new write the agent can make to the shop or the outside world (a new Agent API endpoint plus its ActionSpec, tool, limits, risk tier and inbox renderer). Use when the agent must be able to change something new.
---

A write is a contract first, then two implementations of the same rules that assert the same vectors. Never raise a
limit in the change that adds the capability (CLAUDE.md invariant 4).

1. **Contract** (`packages/contracts/openapi/web-agent-api.yaml`, bump the minor version):
   - the path (path parameters as `{ref}`), the request body (with `dry_run`), the write class and capability in the
     summary, and the responses in the contract's check order: 400, 403, 404, 409 or 422, 502 for a platform;
   - limit vectors in `packages/contracts/test-vectors/limits/requests.json` for every rule (`expect.status`, `code`,
     `reason`), stated by hand, never generated from either implementation;
   - `npx -y @redocly/cli@2 lint --config packages/contracts/redocly.yaml`.
2. **Agent domain** (`apps/agent-service/src/shop_agent/domain/`):
   - the body model and an `ActionDef` in `actions.py` (endpoint template, write class, capability source,
     `editable_fields`); the body is exactly the request body without `dry_run`;
   - the rule in `growth/policies.py` (`evaluate`, `within_low_caps` for auto_low) and the tier in
     `policies/tiers.py`;
   - `adapters/fake_shop.py` (and `fake_marketing.py` for marketing state) applies it and its undo.
3. **Web** (`apps/web-ecommerce/src/core/server/services/`):
   - the route in `agent/AgentLimits.ts` (`AGENT_ROUTES`, `parseBody`, the check in `evaluate`, `withinLowCaps`), and
     the state it needs in `agent/AgentState.ts`;
   - the handler (`agent/PromotionActions.ts`, `agent/MarketingActions.ts`, or `AgentActionService.ts` for shop
     operations) taking a `WriteContext`, returning `{detail, undo}`; platform calls last and never in a dry run;
   - its undo kind in `agent/AgentWrites.ts` and `AgentActionService.applyUndo`;
   - the route in `src/app/api/AgentApi.Controller.ts` (`HANDLERS` in `AgentActionService`).
   Ingestion writes (no grant, no undo) go in `agent/IngestionActions.ts` and `INGESTION_ROUTES`.
4. **Tools and graphs**: a copilot write tool in `tools/writes.py` (`_write`, key `{thread_id}:{tool_call_id}`); the
   loop picks the action up from the playbook and `validate` without graph changes.
5. **Console**: an inbox renderer with the action's `editable_fields`.
6. **Tests**:
   - agent: `uv run pytest -q tests/contract tests/unit/adapters` (vectors, schema parity, the double accepts the body);
   - web: `yarn test --testPathPatterns limits.vectors` and a db test like `tests/db/agent-api.promotions.test.ts`
     (grant, replay, 409, caps, revert) with `tests/db/support/agentApi.ts`;
   - `python scripts/gate.py --phase 6` and `--tier db`.
