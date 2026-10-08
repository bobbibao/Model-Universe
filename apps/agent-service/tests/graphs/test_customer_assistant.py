from collections.abc import Awaitable, Callable
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, Mock

import pytest
from langgraph_sdk import Auth
from pydantic import ValidationError

from shop_agent import auth as customer_auth
from shop_agent import llm
from shop_agent.graphs import customer_assistant


async def test_planner_proposes_customer_actions_without_write_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    invoke = AsyncMock(
        return_value=customer_assistant.Decision(
            answer="Choose this model to add to your bag.",
            actions=[customer_assistant.ActionProposal(kind="cart_add", productId=3, quantity=1)],
        )
    )
    model = Mock()
    model.with_structured_output.return_value.ainvoke = invoke
    monkeypatch.setattr(llm, "chat_model", Mock(return_value=model))
    result = await customer_assistant.graph.ainvoke(
        {"request": {"message": "Add this Gunpla model", "locale": "en", "readsAllowed": False}}
    )
    assert result["decision"]["actions"][0]["productId"] == 3
    model.bind_tools.assert_not_called()
    assert "without invented facts or a model-selected star rating" in " ".join(
        invoke.call_args.args[0][0].content.split()
    )


def test_customer_schema_rejects_admin_and_external_tools() -> None:
    with pytest.raises(ValidationError):
        customer_assistant.StoreRead(kind="sql")
    with pytest.raises(ValidationError):
        customer_assistant.ActionProposal(kind="marketing_publish")


async def _authorize(handler: object, context: object, value: dict[str, Any]) -> bool:
    # SDK decorator stubs lose the callback signature; runtime registration retains the function.
    callback = cast(Callable[[Any, dict[str, Any]], Awaitable[bool]], handler)
    return await callback(context, value)


async def test_customer_role_cannot_access_shop_threads_store_or_admin_graphs() -> None:
    ctx = SimpleNamespace(permissions=["role:customer"], resource="store", action="search")
    assert not await _authorize(customer_auth.read_thread, ctx, {})
    assert not await _authorize(customer_auth.search_threads, ctx, {})
    assert not await _authorize(customer_auth.search_assistants, ctx, {})
    with pytest.raises(Auth.exceptions.HTTPException):
        await _authorize(customer_auth.use_store, ctx, {})
    for graph in ["assistant", "monitor", "improvement", "collect", "marketing_copy"]:
        with pytest.raises(Auth.exceptions.HTTPException):
            await _authorize(customer_auth.create_run, ctx, {"assistant_id": graph})
    assert await _authorize(customer_auth.create_run, ctx, {"assistant_id": "customer_assistant"})


async def test_customer_identity_is_isolated_from_shop(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(
        agent_actor_secret="unused", agent_actor_issuer="web-ecommerce", agent_actor_audience="shop-agent"
    )
    monkeypatch.setattr(customer_auth, "get_settings", lambda: settings)
    monkeypatch.setattr(
        customer_auth, "verify_actor_token", lambda *a, **kw: SimpleNamespace(sub="user:7", role="customer")
    )
    result = await customer_auth.authenticate({"authorization": "Bearer signed-by-web"})
    assert result["identity"] == "customer:user:7"
    assert result["permissions"] == ["role:customer"]
