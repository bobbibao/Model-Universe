# contracts

The single source of truth for communication between `apps/web-ecommerce` and `apps/agent-service`.

- `openapi/web-agent-api.yaml` - the agent calls the web app's Agent API (every write to the shop).
- `test-vectors/` - inputs and expected outputs that both sides assert, so the two implementations cannot drift:
  - `hash/request-hash.json`: the canonical JSON and request hash used for idempotency and approval grants
    (web `hashAgentRequest`, agent `domain/approval.py`);
  - `actor-token.json`: the actor tokens the web gateway signs for the Agent Server (web `signAgentActorToken`,
    agent `adapters/actor_tokens.py`).

The web calls the Agent Server through the LangGraph SDK API (threads, runs, store), which is not redefined here;
the web gateway allowlists the routes it forwards (`AgentGatewayService`).

Clients are hand-written in each app's own style and kept in step with these files:
- TypeScript (web): `src/app/api/AgentApi.Controller.ts` and `AgentActionService` serve the Agent API.
- Python (agent): `shop_agent/adapters/shop_api.py` calls it; `tests/support/web_double.py` validates every request
  and response against the OpenAPI file.

Change the contract first, code second, in the same change. Regenerate the vectors with `yarn test-vectors`
(apps/web-ecommerce) and run both test suites.
