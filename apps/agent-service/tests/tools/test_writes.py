import pytest
from langgraph.store.memory import InMemoryStore

from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.domain.policies.limits import Limits
from shop_agent.testing.grants import approval_test_secret, approve
from shop_agent.tools import deps as deps_module
from shop_agent.tools.deps import ShopDeps, get_deps
from shop_agent.tools.writes import GRANTS_NAMESPACE, apply_discount, create_task, revert_action
from tests.support.factories import NOW
from tests.support.tools import call_tool


async def test_write_uses_thread_and_tool_call_as_key(shop: FakeShop, deps: ShopDeps) -> None:
    args = {"skus": ["OLD1"], "percent": 20, "duration_days": 7}
    text = await call_tool(apply_discount, args, deps, thread_id="th-9", call_id="call-42")
    assert text.startswith("Done") and "th-9:call-42" in text
    [sent] = shop.applied("pricing/discounts")
    assert sent.idempotency_key == "th-9:call-42"
    assert sent.body == {"skus": ["OLD1"], "percent": 20.0, "duration_days": 7}
    again = await call_tool(apply_discount, args, deps, thread_id="th-9", call_id="call-42")
    assert again.startswith("Done") and len(shop.applied()) == 1  # a retry never applies twice


async def test_limits_refuse_before_sending(shop: FakeShop, deps: ShopDeps) -> None:
    deps.limits = Limits(max_discount_pct=30)
    text = await call_tool(apply_discount, {"skus": ["OLD1"], "percent": 35, "duration_days": 7}, deps)
    assert text.startswith("ERROR: refused before sending") and shop.sent == []
    bad = await call_tool(create_task, {"title": "", "assignee_role": "warehouse"}, deps)
    assert bad.startswith("ERROR: refused before sending") and shop.sent == []


async def test_the_stored_grant_is_forwarded(shop: FakeShop, deps: ShopDeps) -> None:
    shop.grant_secret = approval_test_secret()
    args = {"skus": ["OLD1"], "percent": 20.0, "duration_days": 7}
    refused = await call_tool(apply_discount, args, deps, call_id="c1")
    assert "approval_required" in refused
    store = InMemoryStore()
    grant = approve(
        thread_id="t1",
        actions=[("c2", "pricing/discounts", "t1:c2", args)],
        now=int(NOW.timestamp()),
        tool_call_ids=["c2"],
    )
    await store.aput((GRANTS_NAMESPACE, "t1"), "c2", {"token": grant})
    assert (await call_tool(apply_discount, args, deps, store=store, call_id="c2")).startswith("Done")


async def test_revert(shop: FakeShop, deps: ShopDeps) -> None:
    await call_tool(apply_discount, {"skus": ["OLD1"], "percent": 20, "duration_days": 7}, deps, call_id="c1")
    assert shop.discounts == {"OLD1": 20.0}
    assert (await call_tool(revert_action, {"of_key": "t1:c1"}, deps)).startswith("Reverted")
    assert shop.discounts == {}


async def test_deps_come_from_the_provider_without_a_context(deps: ShopDeps, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(deps_module, "_provider", None)
    with pytest.raises(RuntimeError, match="no ShopDeps"):
        await get_deps(None)

    async def provider() -> ShopDeps:
        return deps

    deps_module.configure(provider)
    assert await get_deps(None) is deps
    text = await call_tool(create_task, {"title": "Kiểm kho", "assignee_role": "warehouse"}, None)
    assert text.startswith("Done")
