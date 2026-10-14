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
            reads=[],
            productIds=[],
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
        customer_assistant.Decision.model_validate({})
    with pytest.raises(ValidationError):
        customer_assistant.Decision(answer="", reads=[], actions=[], productIds=[])
    with pytest.raises(ValidationError):
        customer_assistant.Decision.model_validate({"answer": "Incomplete answer-only native response"})
    # A read round may leave the answer empty (the reply is written once, after the reads); the last round may not.
    assert set(customer_assistant.Decision.model_json_schema()["required"]) == {"reads", "actions", "productIds"}
    assert customer_assistant.Decision(
        reads=[customer_assistant.StoreRead(kind="store_policies")], actions=[], productIds=[]
    )
    assert "answer" in customer_assistant.FinalDecision.model_json_schema()["required"]
    with pytest.raises(ValidationError):
        customer_assistant.FinalDecision(actions=[], productIds=[], answer="")
    assert "reads" not in customer_assistant.FinalDecision.model_json_schema()["properties"]
    with pytest.raises(ValidationError):
        customer_assistant.StoreRead(kind="sql")
    with pytest.raises(ValidationError):
        customer_assistant.ActionProposal(kind="marketing_publish")


def test_return_items_and_shipping_expose_their_fields_to_the_model() -> None:
    # An untyped dict let a live model send returnItems=[{}], which the web then dropped silently.
    defs = customer_assistant.Decision.model_json_schema()["$defs"]
    assert set(defs["ReturnItemDraft"]["required"]) == {"orderItemId", "quantity", "reason"}
    assert {"address", "ward", "district", "city"} <= set(defs["ShippingDraft"]["properties"])
    with pytest.raises(ValidationError):
        customer_assistant.ActionProposal(kind="return_request", orderId=885, returnItems=[{}])
    with pytest.raises(ValidationError):
        customer_assistant.ActionProposal(
            kind="return_request", orderId=885, returnItems=[{"orderItemId": 1, "quantity": 1, "reason": "x"}]
        )


async def test_order_and_wishlist_ids_never_become_product_recommendations(monkeypatch: pytest.MonkeyPatch) -> None:
    model = Mock()
    model.with_structured_output.return_value.ainvoke = AsyncMock(
        return_value=customer_assistant.Decision(
            reads=[], actions=[], productIds=[501, 502, 701, 801, 601], answer="Review your order before confirming."
        )
    )
    monkeypatch.setattr(llm, "chat_model", Mock(return_value=model))
    result = await customer_assistant.graph.ainvoke(
        {
            "request": {
                "catalog": [{"id": 501}],
                "cart": [{"productId": 502}],
                "observations": [{"data": {"id": 701, "orderItemId": 801, "wishlistItemId": 601}}],
            }
        }
    )
    assert result["decision"]["productIds"] == [501, 502]


@pytest.mark.parametrize("reads_allowed", [False, True])
async def test_model_cannot_reopen_the_web_read_budget(monkeypatch: pytest.MonkeyPatch, reads_allowed: bool) -> None:
    proposed_read = customer_assistant.StoreRead(kind="my_orders")
    model = Mock()
    model.with_structured_output.return_value.ainvoke = AsyncMock(
        return_value=customer_assistant.Decision(
            reads=[proposed_read],
            actions=[customer_assistant.ActionProposal(kind="apply_coupon", code="MUDEMO10")],
            productIds=[],
            answer="Review the coupon draft before confirming.",
        )
    )
    monkeypatch.setattr(llm, "chat_model", Mock(return_value=model))
    result = await customer_assistant.graph.ainvoke({"request": {"readsAllowed": reads_allowed}})
    assert result["decision"]["reads"] == ([{"kind": "my_orders"}] if reads_allowed else [])
    assert result["decision"]["actions"] == [{"kind": "apply_coupon", "code": "MUDEMO10"}]


async def _authorize(handler: object, context: object, value: dict[str, Any]) -> bool | Auth.types.FilterType:
    # SDK decorator stubs lose the callback signature; runtime registration retains the function.
    callback = cast(Callable[[Any, dict[str, Any]], Awaitable[bool | Auth.types.FilterType]], handler)
    return await callback(context, value)


async def test_customer_role_cannot_access_shop_threads_store_or_admin_graphs() -> None:
    ctx = SimpleNamespace(
        permissions=["role:customer"],
        resource="store",
        action="search",
        user=SimpleNamespace(identity="customer:user:7"),
    )
    assert await _authorize(customer_auth.read_thread, ctx, {}) == {"customer_owner": "customer:user:7"}
    assert await _authorize(customer_auth.delete_thread, ctx, {}) == {"customer_owner": "customer:user:7"}
    assert not await _authorize(customer_auth.search_threads, ctx, {})
    assert not await _authorize(customer_auth.search_assistants, ctx, {})
    with pytest.raises(Auth.exceptions.HTTPException):
        await _authorize(customer_auth.use_store, ctx, {})
    for graph in ["assistant", "monitor", "improvement", "collect", "marketing_copy"]:
        with pytest.raises(Auth.exceptions.HTTPException):
            await _authorize(customer_auth.create_run, ctx, {"assistant_id": graph})
    request: dict[str, Any] = {"assistant_id": "customer_assistant", "metadata": {"customer_owner": "shop"}}
    assert await _authorize(customer_auth.create_run, ctx, request) == {"customer_owner": "customer:user:7"}
    assert request["metadata"]["customer_owner"] == "customer:user:7"


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


def _route(monkeypatch: pytest.MonkeyPatch, intent: str | None, confidence: float = 0.95) -> AsyncMock:
    answers = (
        None
        if intent is None
        else {"intent": llm.DecisionAnswer(choice=intent, confidence=confidence, probabilities={intent: confidence})}
    )
    decide = AsyncMock(return_value=answers)
    monkeypatch.setattr(llm, "decide", decide)
    return decide


def _planner(monkeypatch: pytest.MonkeyPatch, decision: object) -> Mock:
    model = Mock()
    raw = Mock(usage_metadata={"input_tokens": 1200, "output_tokens": 80, "input_token_details": {"cache_read": 1024}})
    model.with_structured_output.return_value.ainvoke = AsyncMock(
        return_value={"raw": raw, "parsed": decision, "parsing_error": None}
    )
    monkeypatch.setattr(llm, "chat_model", Mock(return_value=model))
    return model


async def test_a_routed_greeting_needs_no_planner_call(monkeypatch: pytest.MonkeyPatch) -> None:
    _route(monkeypatch, "greeting")
    model = _planner(monkeypatch, None)
    result = await customer_assistant.graph.ainvoke({"request": {"message": "Xin chào", "locale": "vi"}})
    assert result["decision"]["answer"] == customer_assistant.GREETINGS["vi"]
    assert result["decision"]["reads"] == [] and result["decision"]["actions"] == []
    model.with_structured_output.assert_not_called()


async def test_argument_free_reads_skip_a_planner_round(monkeypatch: pytest.MonkeyPatch) -> None:
    _route(monkeypatch, "policy")
    model = _planner(monkeypatch, None)
    result = await customer_assistant.graph.ainvoke({"request": {"message": "Đổi trả thế nào?", "readsAllowed": True}})
    assert result["decision"]["reads"] == [{"kind": "store_policies"}]
    assert result["decision"]["route"] == {"intent": "policy", "confidence": 0.95}
    model.with_structured_output.assert_not_called()

    # A guest has no orders to read: the planner explains instead of a shortcut read.
    _route(monkeypatch, "orders")
    model = _planner(monkeypatch, customer_assistant.Decision(reads=[], actions=[], productIds=[], answer="Sign in."))
    guest = await customer_assistant.graph.ainvoke({"request": {"message": "My orders?", "loggedIn": False}})
    assert guest["decision"]["reads"] == [] and guest["decision"]["answer"] == "Sign in."
    model.with_structured_output.assert_called_once()


async def test_a_product_page_question_reads_its_reviews_first(monkeypatch: pytest.MonkeyPatch) -> None:
    _route(monkeypatch, "product")
    _planner(monkeypatch, None)
    request = {
        "message": "Is it worth it?",
        "path": "/shop/product/142",
        "observations": [{"kind": "current_product", "data": {"id": 142}}],
    }
    result = await customer_assistant.graph.ainvoke({"request": request})
    assert result["decision"]["reads"] == [{"kind": "product_reviews", "productId": 142}]


async def test_information_intents_use_the_prompt_and_schema_without_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    decide = _route(monkeypatch, "search")
    model = _planner(
        monkeypatch,
        customer_assistant.ReadDecision(
            reads=[customer_assistant.StoreRead(kind="search_products", maxPrice=1000000)], productIds=[]
        ),
    )
    result = await customer_assistant.graph.ainvoke({"request": {"message": "Kits under 1 million"}})
    schema = model.with_structured_output.call_args.args[0]
    assert schema is customer_assistant.ReadDecision
    prompt = model.with_structured_output.return_value.ainvoke.call_args.args[0][0].content
    assert prompt == customer_assistant.INFO_PROMPT and "cart_add" not in prompt
    assert result["decision"]["reads"] == [{"kind": "search_products", "maxPrice": 1000000}]
    assert result["decision"]["actions"] == []
    assert result["decision"]["usage"] == {"input": 1200, "output": 80, "cached": 1024}
    decide.assert_awaited_once()

    # Later rounds reuse the route the web echoed back: no second classification, and the final schema has no reads.
    decide.reset_mock()
    model = _planner(monkeypatch, customer_assistant.FinalReadDecision(productIds=[], answer="Two kits fit."))
    request = {
        "message": "Kits under 1 million",
        "readsAllowed": False,
        "route": {"intent": "search", "confidence": 0.95},
        "observations": [{"tool": {"kind": "search_products"}, "data": {}}],
    }
    result = await customer_assistant.graph.ainvoke({"request": request})
    assert model.with_structured_output.call_args.args[0] is customer_assistant.FinalReadDecision
    assert result["decision"]["answer"] == "Two kits fit."
    decide.assert_not_awaited()


@pytest.mark.parametrize(("intent", "confidence"), [(None, 0.0), ("search", 0.5), ("cart", 0.99)])
async def test_unrouted_uncertain_or_action_turns_get_the_full_planner(
    monkeypatch: pytest.MonkeyPatch, intent: str | None, confidence: float
) -> None:
    _route(monkeypatch, intent, confidence)
    model = _planner(monkeypatch, customer_assistant.Decision(reads=[], actions=[], productIds=[], answer="Sure."))
    await customer_assistant.graph.ainvoke({"request": {"message": "Add kit 3 to my bag"}})
    assert model.with_structured_output.call_args.args[0] is customer_assistant.Decision
    prompt = model.with_structured_output.return_value.ainvoke.call_args.args[0][0].content
    assert prompt == customer_assistant.FULL_PROMPT
