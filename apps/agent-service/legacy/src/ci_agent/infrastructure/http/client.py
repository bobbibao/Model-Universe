"""Tiny JSON HTTP client abstraction so channel/shop adapters are testable without a network."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: dict[str, Any]


class JsonHttpClient(Protocol):
    def post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> HttpResponse: ...

    def post_bytes(self, url: str, body: bytes, headers: dict[str, str] | None = None) -> HttpResponse:
        """POST an already-serialized JSON body exactly as given (needed when the bytes are signed)."""


class UrllibJsonHttpClient:
    """Stdlib implementation. Swap for httpx if you need pooling or async."""

    def __init__(self, timeout: float = 10.0) -> None:
        self._timeout = timeout

    def post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> HttpResponse:
        return self.post_bytes(url, json.dumps(payload).encode("utf-8"), headers)

    def post_bytes(self, url: str, body: bytes, headers: dict[str, str] | None = None) -> HttpResponse:
        req = urllib.request.Request(url, data=body, method="POST",
                                     headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:  # noqa: S310 (trusted, configured URLs)
                raw = resp.read().decode("utf-8") or "{}"
                return HttpResponse(resp.status, json.loads(raw))
        except urllib.error.HTTPError as exc:
            try:
                error_body = json.loads(exc.read().decode("utf-8") or "{}")
            except ValueError:
                error_body = {}
            return HttpResponse(exc.code, error_body)
        except (urllib.error.URLError, TimeoutError) as exc:
            return HttpResponse(0, {"error": str(exc)})
