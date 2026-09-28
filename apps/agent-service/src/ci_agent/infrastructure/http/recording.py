from __future__ import annotations

from typing import Any

from ci_agent.infrastructure.http.client import HttpResponse


class RecordingHttpClient:
    """Fake JsonHttpClient for tests and the simulator: records calls, returns a canned response."""

    def __init__(self, status: int = 200, body: dict[str, Any] | None = None) -> None:
        self.status, self.body = status, body if body is not None else {"ok": True}
        self.calls: list[tuple[str, dict[str, Any], dict[str, str]]] = []

    def post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> HttpResponse:
        self.calls.append((url, payload, headers or {}))
        return HttpResponse(self.status, dict(self.body))
