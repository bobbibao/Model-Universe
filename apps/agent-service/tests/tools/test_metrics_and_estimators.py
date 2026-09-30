from shop_agent.domain.options import plan_option
from shop_agent.tools.deps import ShopDeps
from shop_agent.tools.estimators import estimate_discount, estimate_outlet, estimate_repackage
from shop_agent.tools.metrics import find_dead_stock, find_high_return_skus, get_kpis, get_stock
from tests.support.factories import NOW, opportunity
from tests.support.tools import call_tool


async def test_find_dead_stock_lists_worst_value_first(deps: ShopDeps) -> None:
    text = await call_tool(find_dead_stock, {}, deps)
    lines = text.splitlines()
    assert lines[0].startswith("2 mã tồn kho lâu")
    assert lines[1].startswith("- OLD1") and lines[2].startswith("- OLD2")
    assert "15.000.000 ₫" in lines[1]  # 30 x 500,000


async def test_find_high_return_skus_explains_reasons(deps: ShopDeps) -> None:
    text = await call_tool(find_high_return_skus, {}, deps)
    assert "- RET: 5 returned of 6 sold" in text
    assert "not as described x3" in text and "size x2" in text


async def test_get_stock_and_kpis(deps: ShopDeps) -> None:
    assert "BEST (Sản phẩm BEST): 60 units" in await call_tool(get_stock, {"skus": ["BEST", "NOPE"]}, deps)
    assert await call_tool(get_stock, {"skus": ["NOPE"]}, deps) == "None of these SKUs is in the shop."
    kpis = await call_tool(get_kpis, {}, deps)
    assert "Giá trị hàng tồn lâu (dead_stock_value_vnd): 20.000.000 ₫" in kpis


async def test_estimates_are_the_domain_numbers(deps: ShopDeps) -> None:
    text = await call_tool(estimate_discount, {"skus": ["OLD1", "OLD2"], "percent": 25, "duration_days": 10}, deps)
    snap = await deps.reader.snapshot(NOW)
    plan = plan_option("discount", {"percent": 25, "duration_days": 10}, opportunity(skus=("OLD1", "OLD2")), snap, NOW)
    assert f"{plan.estimate.recovery_vnd:,}".replace(",", ".") + " ₫" in text
    assert "action: Giảm 25% cho 2 mã trong 10 ngày" in text


async def test_estimate_explains_when_not_applicable(deps: ShopDeps) -> None:
    assert (await call_tool(estimate_outlet, {"skus": ["BEST"]}, deps)).startswith("Not applicable:")
    assert "percent must be" in await call_tool(
        estimate_discount, {"skus": ["OLD1"], "percent": 95, "duration_days": 3}, deps
    )
    assert "strategy repackage" in await call_tool(estimate_repackage, {"skus": ["RET"]}, deps)
