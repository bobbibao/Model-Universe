# contracts

The single source of truth for communication between `apps/web-ecommerce` and `apps/agent-service`.

- `openapi/agent-service.yaml` - web calls the agent (list/decide on improvements, trigger a
  run, read KPI impact and cases).
- `openapi/web-agent-api.yaml` - the agent calls the web app (all Act-phase writes).
- `events/web-events.schema.json` - the JSON schema of the events the agent posts to the web
  app's webhook (see `infrastructure/events/web_webhook.py`).

Clients are hand-written in each app's own style and kept in step with these files:
- TypeScript (web): the server-side proxy service and the static `CiApi` axios class, following
  `apps/web-ecommerce`'s existing `src/core/client/api/*` pattern. No generated client or
  `openapi-typescript` dependency, by decision.
- Python (agent): `infrastructure/shop/http_action.py` (Agent API) and the DTOs in
  `interfaces/http/schemas.py`.

Change the contract first, code second, in the same PR. The consumer-side contract test
`apps/agent-service/tests/integration/test_web_agent_api.py` checks the web Agent API against
this contract when a web app is running.
