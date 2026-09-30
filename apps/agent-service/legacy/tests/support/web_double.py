"""An in-process stand-in for the web Agent API's idempotency contract (packages/contracts/openapi/web-agent-api.yaml,
AgentActionService in apps/web-ecommerce), behind the real HttpShopActionAdapter:

- a new Idempotency-Key is applied once and its response stored;
- the same key with the same body replays the stored response and applies nothing;
- the same key with a different body is refused with 409;
- dry runs are validated but never stored.

tests/integration/test_web_agent_api.py checks the real web app against the same contract.
"""
from __future__ import annotations

import json
from typing import Any

from ci_agent.infrastructure.http.client import HttpResponse


class IdempotentWebDouble:
    def __init__(self) -> None:
        self.stored: dict[str, tuple[str, dict[str, Any]]] = {}  # key -> (canonical body, response)
        self.applied: list[str] = []  # keys actually applied, in order
        self.requests: list[tuple[str, str, str]] = []  # (url, key, canonical body) of every call
        self.replays = 0
        self.conflicts = 0

    def post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> HttpResponse:
        key = (headers or {})["Idempotency-Key"]
        body = json.dumps(payload, sort_keys=True)
        self.requests.append((url, key, body))
        if payload.get("dry_run"):
            return HttpResponse(200, {"ref": None, "detail": "dry run"})
        if key in self.stored:
            stored_body, response = self.stored[key]
            if stored_body != body:
                self.conflicts += 1
                return HttpResponse(409, {"error": "Idempotency-Key reused with a different payload"})
            self.replays += 1
            return HttpResponse(200, dict(response))
        self.applied.append(key)
        response = {"ref": f"web:{len(self.applied)}", "detail": f"applied {url.rsplit('/', 1)[-1]}"}
        self.stored[key] = (body, response)
        return HttpResponse(200, dict(response))

    def post_bytes(self, url: str, body: bytes, headers: dict[str, str] | None = None) -> HttpResponse:
        return self.post_json(url, json.loads(body), headers)
