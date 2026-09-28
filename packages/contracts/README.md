# contracts

The single source of truth for communication between `apps/web` and `apps/agent-service`.

- `openapi/agent-service.yaml` - web calls the agent (list/decide on improvements, trigger a
  run, read KPI impact and cases).
- `openapi/web-agent-api.yaml` - the agent calls the web app (all Act-phase writes).
- `events/web-events.schema.json` - the JSON schema of the events the agent posts to the web
  app's webhook (see `infrastructure/events/web_webhook.py`).

Generate clients from the contract; don't hand-write them:
- TypeScript (web): `openapi-typescript` (types) + `openapi-fetch`.
- Python (agent): `datamodel-code-generator` (pydantic models) if a typed client is ever
  needed beyond the DTOs already in `interfaces/http/schemas.py`.

Change the contract first, code second. Add a CI check that generated clients haven't drifted.
