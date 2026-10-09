"""The copilot (plan Phase 8): write tools behind human-in-the-loop approval with grants from the resume command,
subagents without write tools, approved memory, and dependencies without a run context.

The shop is tests/graphs/conftest.py's FakeShop, which refuses any shop change without a valid grant (or the web's
auto_low rule), like the web. Each test scripts the main agent under its own script key.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import pytest
from langchain.agents.middleware import PIIMiddleware
from langchain_core.messages import ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.types import Command

from shop_agent.domain.capabilities import Capability
from shop_agent.domain.pii import VN_PHONE
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings
from shop_agent.graphs import assistant
from shop_agent.testing.grants import approval_test_secret, approve
from shop_agent.tools import deps as deps_module
from shop_agent.tools.deps import ShopDeps
from shop_agent.tools.writes import WRITE_TOOLS
from tests.graphs.conftest import World

DISCOUNT = {"skus": ["OLD1"], "percent": 20, "duration_days": 7}


@dataclass
class Copilot:
    world: World
    graph: Any
    store: InMemoryStore
    script_key: str = ""
    thread_id: str = "chat-1"

    def config(self) -> dict[str, Any]:
        return {"configurable": {"thread_id": self.thread_id}, "metadata": {"script_key": self.script_key}}

    async def run(self, value: Any, *, context: ShopDeps | None = None) -> dict[str, Any]:
        result: dict[str, Any] = await self.graph.ainvoke(value, self.config(), context=context or self.world.deps)
        return result

    async def ask(self, text: str, **kwargs: Any) -> dict[str, Any]:
        return await self.run({"messages": [{"role": "user", "content": text}]}, **kwargs)

    def call_id(self, step: int = 0) -> str:
        return f"call-{self.script_key}-{step}-0"  # how the scripted model names its tool calls

    def grant(self, call_id: str, endpoint: str, body: dict[str, Any]) -> str:
        key = f"{self.thread_id}:{call_id}"
        now = int(self.world.clock().timestamp())
        return approve(
            thread_id=self.thread_id, actions=[(call_id, endpoint, key, body)], now=now, tool_call_ids=[call_id]
        )

    def shop_changes(self) -> list[Any]:
        return [s for s in self.world.shop.sent if s.applied]


@pytest.fixture
def copilot(world: World, scripts: Any) -> Any:
    def make(script_key: str, steps: list[dict[str, Any]], **more: list[dict[str, Any]]) -> Copilot:
        scripts({script_key: steps, **{f"{script_key}/{agent}": s for agent, s in more.items()}})
        store = InMemoryStore()
        return Copilot(world, assistant.build(checkpointer=InMemorySaver(), store=store), store, script_key)

    return make


def calls(name: str, args: dict[str, Any]) -> dict[str, Any]:
    return {"tool_calls": [{"name": name, "args": args}]}


def pending(result: dict[str, Any]) -> dict[str, Any]:
    [interrupt] = result["__interrupt__"]
    request: dict[str, Any] = interrupt.value
    return request


async def test_a_write_tool_interrupts_and_nothing_runs(copilot: Any) -> None:
    chat = copilot("assistant.discount", [calls("apply_discount", DISCOUNT), {"content": "Đã xong."}])
    result = await chat.ask("Giảm 20% cho OLD1 trong 7 ngày.")
    [action] = pending(result)["action_requests"]
    assert action["name"] == "apply_discount" and action["args"] == DISCOUNT
    assert action["description"] == "Giảm 20% cho 1 mã trong 7 ngày"
    assert pending(result)["review_configs"][0]["allowed_decisions"] == ["approve", "edit", "reject"]
    assert chat.world.shop.sent == []


@pytest.mark.parametrize("raw_minimum,shown_minimum", [("500000", 500000), ("not-money", "not-money")])
async def test_numeric_string_cannot_bypass_approval_through_tool_coercion(
    copilot: Any, raw_minimum: str, shown_minimum: int | str
) -> None:
    args = {
        "code": "AI-7DAY10",
        "title": "Synthetic coupon",
        "percent": 10,
        "duration_days": 7,
        "min_order_vnd": raw_minimum,
    }
    chat = copilot("assistant.coercion", [calls("create_coupon", args), {"content": "Created."}])
    # Even an intentionally permissive demo writer must not be reached before human review.
    chat.world.shop.grant_secret = None
    result = await chat.ask("Prepare a 10% coupon for orders from 500000 VND.")
    [action] = pending(result)["action_requests"]
    assert action["name"] == "create_coupon" and action["args"] == {**args, "min_order_vnd": shown_minimum}
    assert chat.world.shop.sent == []
    if isinstance(shown_minimum, int):
        chat.world.shop.grant_secret = approval_test_secret()
        call_id = chat.call_id()
        grant = chat.grant(call_id, "promotions/coupons", action["args"])
        await chat.run(
            Command(resume={"decisions": [{"type": "approve"}]}, update={"approval_grants": {call_id: grant}})
        )
        [sent] = chat.shop_changes()
        assert sent.body["min_order_vnd"] == 500000 and sent.grant


async def test_an_edit_runs_the_edited_body_with_its_grant(copilot: Any) -> None:
    chat = copilot("assistant.edit", [calls("apply_discount", DISCOUNT), {"content": "Đã giảm 25%."}])
    await chat.ask("Giảm 20% cho OLD1 trong 7 ngày.")
    call_id = chat.call_id()
    edited = {**DISCOUNT, "percent": 25}
    decision = {"type": "edit", "edited_action": {"name": "apply_discount", "args": edited}}
    grant = chat.grant(call_id, "pricing/discounts", edited)
    result = await chat.run(Command(resume={"decisions": [decision]}, update={"approval_grants": {call_id: grant}}))
    [sent] = chat.shop_changes()
    assert sent.endpoint == "pricing/discounts" and sent.body == {**edited, "percent": 25.0}
    assert sent.idempotency_key == f"chat-1:{call_id}" and sent.grant  # FakeShop verified the grant
    tool_message = next(m for m in result["messages"] if isinstance(m, ToolMessage))
    assert "Done" in str(tool_message.content)
    assert chat.world.shop.discounts == {"OLD1": 25.0}


async def test_a_grant_for_the_model_body_does_not_cover_an_edit(copilot: Any) -> None:
    chat = copilot("assistant.mismatch", [calls("apply_discount", DISCOUNT), {"content": "Không thực hiện được."}])
    await chat.ask("Giảm 20% cho OLD1 trong 7 ngày.")
    call_id = chat.call_id()
    decision = {"type": "edit", "edited_action": {"name": "apply_discount", "args": {**DISCOUNT, "percent": 25}}}
    grant = chat.grant(call_id, "pricing/discounts", DISCOUNT)  # signed over the model's 20%, not the edit
    await chat.run(Command(resume={"decisions": [decision]}, update={"approval_grants": {call_id: grant}}))
    assert chat.shop_changes() == []


async def test_a_reject_runs_nothing(copilot: Any) -> None:
    chat = copilot("assistant.reject", [calls("apply_discount", DISCOUNT), {"content": "Đã hủy."}])
    await chat.ask("Giảm 20% cho OLD1 trong 7 ngày.")
    decision = {"type": "reject", "message": "Không giảm giá tháng này."}
    result = await chat.run(Command(resume={"decisions": [decision]}))
    assert chat.world.shop.sent == []
    rejected = next(m for m in result["messages"] if isinstance(m, ToolMessage))
    assert rejected.status == "error" and "Không giảm giá tháng này." in str(rejected.content)


async def test_low_risk_write_in_auto_low_runs_without_a_person(copilot: Any) -> None:
    chat = copilot("assistant.auto", [calls("apply_discount", {**DISCOUNT, "percent": 10}), {"content": "Đã giảm."}])
    chat.world.shop.settings["brand.approved"] = True
    chat.world.shop.autonomy = AutonomySettings({Capability.PROMOTION: AutonomyMode.AUTO_LOW})
    result = await chat.ask("Giảm 10% cho OLD1 trong 7 ngày.")
    assert "__interrupt__" not in result
    [sent] = chat.shop_changes()
    assert sent.endpoint == "pricing/discounts" and not sent.grant  # the web's auto_low rule, no grant


async def test_above_the_low_risk_caps_a_person_decides_even_in_auto_low(copilot: Any) -> None:
    chat = copilot("assistant.above", [calls("apply_discount", DISCOUNT), {"content": "Đã giảm."}])
    chat.world.shop.settings["brand.approved"] = True
    chat.world.shop.autonomy = AutonomySettings({Capability.PROMOTION: AutonomyMode.AUTO_LOW})
    result = await chat.ask("Giảm 20% cho OLD1 trong 7 ngày.")  # 20% is above the low-risk 15%
    assert pending(result)["action_requests"][0]["name"] == "apply_discount"
    assert chat.world.shop.sent == []


async def test_a_protective_tool_never_waits_for_a_person(copilot: Any) -> None:
    chat = copilot("assistant.revert", [calls("revert_action", {"of_key": "nope"}), {"content": "Không có."}])
    result = await chat.ask("Hoàn tác thao tác nope.")
    assert "__interrupt__" not in result


async def test_subagents_have_no_write_tool_and_there_is_no_general_purpose_one(world: World) -> None:
    writes = {t.name for t in WRITE_TOOLS}
    specs = {spec["name"]: spec for spec in assistant.subagents()}
    assert set(specs) == {"analyst", "customer_voice", "copywriter"}
    for spec in specs.values():
        assert writes.isdisjoint(t.name for t in spec["tools"]), spec["name"]  # type: ignore[union-attr]
    task = next(t for t in assistant.build().nodes["tools"].bound.tools_by_name.values() if t.name == "task")
    listed = re.findall(r"^- ([\w-]+): ", task.description, re.MULTILINE)  # "Available agent types ..."
    assert listed == ["analyst", "customer_voice", "copywriter"]  # no general-purpose agent with the write tools


async def test_customer_voice_redacts_phone_numbers_and_emails() -> None:
    assert re.search(VN_PHONE, "gọi 0912 345 678 nhé") and re.search(VN_PHONE, "+84912345678")
    assert not re.search(VN_PHONE, "đơn 1234567890123")
    customer_voice = next(spec for spec in assistant.subagents() if spec["name"] == "customer_voice")
    redacting = {m.pii_type: m for m in customer_voice.get("middleware", []) if isinstance(m, PIIMiddleware)}
    assert set(redacting) == {"email", "vn_phone"}
    assert all(m.apply_to_tool_results and m.apply_to_output for m in redacting.values())


async def test_a_memory_write_interrupts_and_lands_in_the_store_once_approved(copilot: Any) -> None:
    note = "- Chủ cửa hàng không muốn giảm giá quá 15%.\n"
    chat = copilot(
        "assistant.memory",
        [calls("write_file", {"file_path": "/memories/AGENTS.md", "content": note}), {"content": "Đã ghi nhớ."}],
    )
    result = await chat.ask("Ghi nhớ: không giảm giá quá 15%.")
    [action] = pending(result)["action_requests"]
    assert action["name"] == "write_file"
    assert await chat.store.asearch(assistant.MEMORY_NAMESPACE) == []
    await chat.run(Command(resume={"decisions": [{"type": "approve"}]}))
    [item] = await chat.store.asearch(assistant.MEMORY_NAMESPACE)
    assert "15%" in str(item.value)


async def test_a_run_without_context_resolves_its_dependencies(copilot: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    chat: Copilot = copilot("assistant.stock", [calls("get_stock", {"skus": ["OLD1"]}), {"content": "Còn 30."}])
    deps = chat.world.deps

    async def provider() -> ShopDeps:
        return deps

    monkeypatch.setattr(deps_module, "_provider", provider)
    result = await chat.graph.ainvoke({"messages": [{"role": "user", "content": "OLD1 còn bao nhiêu?"}]}, chat.config())
    stock = next(m for m in result["messages"] if isinstance(m, ToolMessage))
    assert "OLD1" in str(stock.content) and "30" in str(stock.content)


async def test_a_subagent_reports_through_the_task_tool(copilot: Any) -> None:
    question = {"description": "Đối thủ nào bán rẻ hơn chúng ta?", "subagent_type": "analyst"}
    chat = copilot(
        "assistant.analyst",
        [calls("task", question), {"content": "Chưa có giá đối thủ."}],
        analyst=[calls("get_competitor_prices", {}), {"content": "Chưa có giá đối thủ nào được ghi nhận."}],
    )
    result = await chat.ask("Đối thủ nào bán rẻ hơn chúng ta?")
    report = next(m for m in result["messages"] if isinstance(m, ToolMessage))
    assert report.name == "task" and str(report.content) == "Chưa có giá đối thủ nào được ghi nhận."
    assert chat.world.shop.sent == []
