"""ShopWriter over the web app's Agent API (/api/agent/v1, packages/contracts/openapi/web-agent-api.yaml).

Every write carries its idempotency key; retries (network errors, 5xx) reuse it, so the web replays its stored response
instead of applying twice. The approval grant, when the action has one, travels in `X-Agent-Approval`; the audit
context in `X-Agent-Context`; a write made inside a graph run carries a W3C `traceparent` whose trace id is the run id,
so the web's audit row (`traceId`), the server's logs and the run's trace share one key.
"""

from __future__ import annotations

import json
import secrets
import uuid
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

import httpx
from langgraph.runtime import get_runtime
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.ports import ActionResult

REQUEST_TIMEOUT_S = 30.0
MAX_ATTEMPTS = 3


def traceparent() -> str | None:
    """The W3C `traceparent` of the current graph run (trace id: the run id; a new span per request), or None outside
    a run (CLI ingestion, simulate without a run id)."""
    try:
        runtime = get_runtime()
    except RuntimeError:
        return None
    info = runtime.execution_info if runtime else None
    if info is None or not info.run_id:
        return None
    try:
        trace_id = uuid.UUID(info.run_id).hex
    except ValueError:
        return None
    return f"00-{trace_id}-{secrets.token_hex(8)}-01"


class _Retryable(Exception):
    def __init__(self, response: httpx.Response) -> None:
        super().__init__(f"HTTP {response.status_code}")
        self.response = response


def _retryable(exc: BaseException) -> bool:
    return isinstance(exc, httpx.TransportError | _Retryable)


def _result(response: httpx.Response) -> ActionResult:
    try:
        payload: Any = response.json()
    except ValueError:
        payload = {}
    payload = payload if isinstance(payload, dict) else {}
    if response.status_code == 200:
        return ActionResult(True, ref=payload.get("ref"), detail=str(payload.get("detail", "")), status_code=200)
    return ActionResult(
        False,
        detail=str(payload.get("error") or f"shop API status {response.status_code}"),
        status_code=response.status_code,
        error_code=str(payload.get("code") or f"http_{response.status_code}"),
        retryable=bool(payload.get("retryable", response.status_code >= 500)),
    )


class AgentApiWriter:
    def __init__(self, base_url: str, token: str, client: httpx.AsyncClient | None = None) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._client = client

    def _headers(self, key: str, grant: str | None, context: Mapping[str, Any] | None) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self._token}", "Idempotency-Key": key}
        if grant:
            headers["X-Agent-Approval"] = grant
        if context:
            headers["X-Agent-Context"] = json.dumps(dict(context), ensure_ascii=True, separators=(",", ":"))
        parent = traceparent()
        if parent:
            headers["traceparent"] = parent
        return headers

    async def _post(self, path: str, body: Mapping[str, Any], headers: dict[str, str]) -> ActionResult:
        async def send(client: httpx.AsyncClient) -> httpx.Response:
            response = await client.post(f"{self._base}/{path}", json=dict(body), headers=headers)
            if response.status_code >= 500:
                raise _Retryable(response)
            return response

        async def attempt() -> httpx.Response:
            if self._client is not None:
                return await send(self._client)
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                return await send(client)

        try:
            async for retry in AsyncRetrying(
                stop=stop_after_attempt(MAX_ATTEMPTS),
                wait=wait_exponential(multiplier=0.5, max=5),
                retry=retry_if_exception(_retryable),
                reraise=True,
            ):
                with retry:
                    return _result(await attempt())
        except _Retryable as exc:
            return _result(exc.response)
        except httpx.TransportError as exc:
            return ActionResult(False, detail=f"shop API unreachable: {exc}", error_code="unreachable", retryable=True)
        raise AssertionError("unreachable")  # pragma: no cover - AsyncRetrying either returns or raises

    async def execute(
        self, action: ActionSpec, *, grant: str | None = None, context: Mapping[str, Any] | None = None
    ) -> ActionResult:
        headers = self._headers(action.idempotency_key, grant, context)
        return await self._post(action.endpoint, action.body, headers)

    async def revert(
        self, of_key: str, *, idempotency_key: str, context: Mapping[str, Any] | None = None
    ) -> ActionResult:
        headers = self._headers(idempotency_key, None, context)
        return await self._post(f"actions/{quote(of_key, safe='')}/revert", {}, headers)

    async def ingest(self, endpoint: str, body: Mapping[str, Any], *, idempotency_key: str) -> ActionResult:
        return await self._post(endpoint, body, self._headers(idempotency_key, None, None))
