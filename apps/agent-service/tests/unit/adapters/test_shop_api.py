import json
import re
import uuid
from typing import Any, TypedDict

import httpx
import pytest
import respx
from langgraph.graph import END, START, StateGraph

from shop_agent.adapters.shop_api import AgentApiWriter
from tests.support.factories import discount

BASE = "http://web.test/api/agent/v1"


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("shop_agent.adapters.shop_api.wait_exponential", lambda **_: lambda _state: 0)


@respx.mock
async def test_sends_body_key_grant_and_context() -> None:
    route = respx.post(f"{BASE}/pricing/discounts").mock(
        return_value=httpx.Response(200, json={"ref": "agent-action-1", "detail": "ok"})
    )
    spec = discount(("A1",), 20)
    result = await AgentApiWriter(BASE, "tok").execute(spec, grant="g.r.a", context={"thread_id": "t1"})
    assert result.ok and result.ref == "agent-action-1"
    request = route.calls.last.request
    assert json.loads(request.content) == spec.body
    assert request.headers["Authorization"] == "Bearer tok"
    assert request.headers["Idempotency-Key"] == spec.idempotency_key
    assert request.headers["X-Agent-Approval"] == "g.r.a"
    assert json.loads(request.headers["X-Agent-Context"]) == {"thread_id": "t1"}
    assert "traceparent" not in request.headers  # not inside a graph run


class _State(TypedDict, total=False):
    ok: bool


@respx.mock
async def test_a_write_inside_a_graph_run_carries_the_run_id_in_its_context_and_trace() -> None:
    route = respx.post(f"{BASE}/pricing/discounts").mock(
        return_value=httpx.Response(200, json={"ref": "r", "detail": ""})
    )

    async def act(state: _State) -> _State:
        writer = AgentApiWriter(BASE, "tok")
        return {"ok": (await writer.execute(discount(("A1",), 20), context={"thread_id": "t1"})).ok}

    builder: StateGraph[_State, Any, _State, _State] = StateGraph(_State)
    graph = builder.add_node("act", act).add_edge(START, "act").add_edge("act", END).compile()
    run_id = uuid.uuid4()
    assert (await graph.ainvoke({}, {"run_id": run_id}))["ok"]
    request = route.calls.last.request
    assert re.fullmatch(rf"00-{run_id.hex}-[0-9a-f]{{16}}-01", request.headers["traceparent"])
    assert json.loads(request.headers["X-Agent-Context"]) == {"run_id": str(run_id), "thread_id": "t1"}


@respx.mock
async def test_retries_5xx_and_network_errors_with_the_same_key() -> None:
    route = respx.post(f"{BASE}/pricing/discounts").mock(
        side_effect=[
            httpx.ConnectError("down"),
            httpx.Response(503),
            httpx.Response(200, json={"ref": "r", "detail": ""}),
        ]
    )
    assert (await AgentApiWriter(BASE, "tok").execute(discount())).ok
    assert {c.request.headers["Idempotency-Key"] for c in route.calls} == {"t1:discount:1"}
    assert route.call_count == 3


@respx.mock
async def test_gives_up_after_three_attempts() -> None:
    respx.post(f"{BASE}/pricing/discounts").mock(return_value=httpx.Response(502, json={"error": "bad gateway"}))
    result = await AgentApiWriter(BASE, "tok").execute(discount())
    assert (result.ok, result.status_code, result.retryable) == (False, 502, True)


@respx.mock
async def test_unreachable() -> None:
    respx.post(f"{BASE}/pricing/discounts").mock(side_effect=httpx.ConnectError("refused"))
    result = await AgentApiWriter(BASE, "tok").execute(discount())
    assert (result.ok, result.error_code, result.retryable) == (False, "unreachable", True)


@respx.mock
async def test_4xx_is_not_retried_and_keeps_the_error_code() -> None:
    route = respx.post(f"{BASE}/pricing/discounts").mock(
        return_value=httpx.Response(403, json={"error": "no grant", "code": "approval_required"})
    )
    result = await AgentApiWriter(BASE, "tok").execute(discount())
    assert (result.status_code, result.error_code, result.detail, result.retryable) == (
        403,
        "approval_required",
        "no grant",
        False,
    )
    assert route.call_count == 1


@respx.mock
async def test_revert_escapes_the_key() -> None:
    route = respx.post(f"{BASE}/actions/t1%3Adiscount%3A1/revert").mock(
        return_value=httpx.Response(200, json={"ref": "r", "detail": "reverted"})
    )
    result = await AgentApiWriter(BASE, "tok").revert("t1:discount:1", idempotency_key="t1:discount:1:revert")
    assert result.ok and route.calls.last.request.headers["Idempotency-Key"] == "t1:discount:1:revert"
