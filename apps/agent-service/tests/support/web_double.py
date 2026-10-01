"""An in-process stand-in for the web Agent API (packages/contracts/openapi/web-agent-api.yaml).

Every request and every response is validated against the OpenAPI file with openapi-core, so a body the agent builds
that the web would refuse fails here too. Behaviour mirrors AgentActionService in apps/web-ecommerce:

- a new Idempotency-Key is applied once and its response stored;
- the same key with the same body (hashed like `hashAgentRequest`) replays the stored response;
- the same key with another body answers 409; failed requests do not consume their key;
- `dry_run: true` is validated but never stored;
- `POST /actions/{key}/revert` compensates an applied action.

Use it through httpx (`transport()`) in unit tests, or over HTTP (`serve()`) for the Agent Server tests.
"""

from __future__ import annotations

import json
import re
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx
import yaml
from openapi_core import OpenAPI
from openapi_core.testing import MockRequest, MockResponse

from shop_agent.domain.approval import request_hash

SPEC = Path(__file__).resolve().parents[4] / "packages" / "contracts" / "openapi" / "web-agent-api.yaml"
BASE_PATH = "/api/agent/v1"
HOST = "http://web.test"
TOKEN = "test-agent-api-token"


def _templates() -> list[tuple[str, re.Pattern[str]]]:
    """The contract's paths, each with a regex that matches a concrete endpoint and captures its path parameters."""
    paths = yaml.safe_load(SPEC.read_text("utf-8"))["paths"]
    templates = []
    for template in paths:
        pattern = re.sub(r"\\\{(\w+)\\\}", r"(?P<\1>[^/]+)", re.escape(template.lstrip("/")))
        templates.append((template, re.compile(f"^{pattern}$")))
    return templates


TEMPLATES = _templates()


class ContractViolation(AssertionError):
    """The double itself answered something the contract does not allow (a bug in the double)."""


@dataclass
class Received:
    method: str
    endpoint: str
    idempotency_key: str | None
    body: dict[str, Any]
    headers: dict[str, str]
    status: int


@dataclass
class WebDouble:
    token: str = TOKEN
    openapi: OpenAPI = field(default_factory=lambda: OpenAPI.from_file_path(str(SPEC)))
    stored: dict[str, tuple[str, dict[str, Any]]] = field(default_factory=dict)  # key -> (request hash, response)
    applied: list[Received] = field(default_factory=list)
    reverted: list[str] = field(default_factory=list)
    received: list[Received] = field(default_factory=list)
    fail_endpoints: set[str] = field(default_factory=set)  # answer 500 for these endpoints
    _lock: threading.Lock = field(default_factory=threading.Lock)

    # ------------------------------------------------------------------------------------------------ core

    def handle(self, method: str, path: str, headers: dict[str, str], raw: bytes) -> tuple[int, dict[str, Any]]:
        lowered = {k.lower(): v for k, v in headers.items()}
        endpoint = path.removeprefix(BASE_PATH).lstrip("/")
        body: dict[str, Any] = json.loads(raw) if raw else {}
        with self._lock:
            status, payload = self._handle(method, path, endpoint, lowered, raw, body)
            self.received.append(Received(method, endpoint, lowered.get("idempotency-key"), body, lowered, status))
            return status, payload

    def _handle(
        self, method: str, path: str, endpoint: str, headers: dict[str, str], raw: bytes, body: dict[str, Any]
    ) -> tuple[int, dict[str, Any]]:
        request = MockRequest(
            HOST,
            method,
            path,
            headers=headers,
            data=raw,
            view_args=self._path_args(endpoint),
            path_pattern=self._pattern(endpoint),
        )
        if headers.get("authorization") != f"Bearer {self.token}":
            return self._respond(request, 401, {"error": "missing or wrong service token", "code": "unauthorized"})
        errors = [str(e) for e in self.openapi.iter_request_errors(request)]
        if errors:
            return self._respond(
                request, 400, {"error": "invalid request", "code": "invalid_request", "details": errors}
            )
        if endpoint in self.fail_endpoints:
            return 500, {"error": "injected failure", "code": "internal"}
        key = headers["idempotency-key"]
        digest = request_hash(endpoint, body)
        if body.get("dry_run"):
            return self._respond(request, 200, {"ref": "dry-run", "detail": "dry run"})
        if key in self.stored:
            stored_hash, response = self.stored[key]
            if stored_hash != digest:
                conflict = {"error": "Idempotency-Key reused with a different payload", "code": "conflict"}
                return self._respond(request, 409, conflict)
            return self._respond(request, 200, dict(response))
        if endpoint.startswith("actions/") and endpoint.endswith("/revert"):
            target = unquote(endpoint.removeprefix("actions/").removesuffix("/revert"))
            if target not in self.stored:
                return self._respond(request, 404, {"error": f"no action with key {target}", "code": "not_found"})
            self.reverted.append(target)
            response = {"ref": f"revert-{target}", "detail": "reverted"}
        else:
            self.applied.append(Received(method, endpoint, key, body, headers, 200))
            response = {"ref": f"agent-action-{len(self.applied)}", "detail": f"applied {endpoint}"}
        self.stored[key] = (digest, response)
        return self._respond(request, 200, response)

    @staticmethod
    def _match(endpoint: str) -> tuple[str, dict[str, str]]:
        """The contract path that serves `endpoint`, and its path parameters (unquoted)."""
        for template, regex in TEMPLATES:
            match = regex.match(endpoint)
            if match:
                return template, {k: unquote(v) for k, v in match.groupdict().items()}
        return f"/{endpoint}", {}

    def _pattern(self, endpoint: str) -> str:
        return f"{BASE_PATH}{self._match(endpoint)[0]}"

    def _path_args(self, endpoint: str) -> dict[str, str]:
        return self._match(endpoint)[1]

    def _respond(self, request: MockRequest, status: int, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        response = MockResponse(json.dumps(payload).encode(), status_code=status)
        errors = [str(e) for e in self.openapi.iter_response_errors(request, response)]
        if errors:
            raise ContractViolation(f"the double's {status} response breaks the contract: {errors}")
        return status, payload

    # ------------------------------------------------------------------------------------------------ transports

    def transport(self) -> httpx.MockTransport:
        def respond(request: httpx.Request) -> httpx.Response:
            status, payload = self.handle(request.method, request.url.path, dict(request.headers), request.content)
            return httpx.Response(status, json=payload)

        return httpx.MockTransport(respond)

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self.transport())

    @contextmanager
    def serve(self, host: str = "127.0.0.1", port: int = 0) -> Iterator[str]:
        """Serve over HTTP in a thread; yields the base URL (`http://127.0.0.1:<port>/api/agent/v1`)."""
        double = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                status, payload = double.handle("POST", self.path, dict(self.headers.items()), raw)
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, format: str, *args: Any) -> None:
                return

        server = ThreadingHTTPServer((host, port), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://{host}:{server.server_address[1]}{BASE_PATH}"
        finally:
            server.shutdown()
            server.server_close()
