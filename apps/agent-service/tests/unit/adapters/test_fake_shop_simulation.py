"""FakeShop's growth-simulation day: sales with the discounts' true response, Monday restock, and injected events."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta

from shop_agent.adapters.fake_marketing import DiscountRecord
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.adapters.fake_world import ScenarioInjection
from shop_agent.domain.growth.snapshot import vn_date
from tests.support.factories import NOW, item


def shop() -> FakeShop:
    stock = {"A": item("A", days=60, quantity=40), "B": item("B", days=60, quantity=40)}
    return FakeShop(stock, [], {"A": 4.0, "B": 4.0}, clock=lambda: NOW)


async def test_a_discount_sells_more_until_it_ends() -> None:
    s = shop()
    today = vn_date(NOW)
    s.marketing.discounts.append(DiscountRecord("A", 20.0, "k", NOW - timedelta(days=1), NOW + timedelta(hours=10)))
    sold = await s.sell_day(today)
    assert sold["A"] > sold.get("B", 0)  # 20% off: 1.6 times the units (response 0.03 per percent)
    assert s.stock["A"].quantity == 40 - sold["A"]
    row = next(r for r in (await s._world(NOW)).sales if r.day == today and r.sku == "A")
    assert row.revenue_vnd == round(row.units * s.stock["A"].unit_price_vnd * 0.8)
    assert s.discounts == {}  # it ended during the day: the catalog shows the list price again


async def test_monday_restocks_selling_skus() -> None:
    s = shop()
    await s._world(NOW)  # the starting stock is what the world was built with
    monday = vn_date(NOW) + timedelta(days=(7 - vn_date(NOW).weekday()) % 7)
    s.stock["A"] = replace(s.stock["A"], quantity=3)
    await s.sell_day(monday)
    assert s.stock["A"].quantity == 40


async def test_injections_put_market_events_in() -> None:
    s = shop()
    await s.sell_day(vn_date(NOW) - timedelta(days=1))
    world = await s._world(NOW)
    keyword = await s.inject(ScenarioInjection(day=1, kind="trend_spike", keyword="áo khoác", factor=2.0), NOW)
    series = [p.interest for p in sorted(world.trends.values(), key=lambda p: p.day) if p.keyword == keyword][-14:]
    assert min(series[-7:]) >= 2 * max(series[:7]) - 1
    sku = await s.inject(ScenarioInjection(day=1, kind="competitor_undercut", factor=1.15), NOW)
    assert world.competitor_prices[-1].sku == sku and world.competitor_prices[-1].observed_at > NOW - timedelta(hours=2)
    ref = await s.inject(ScenarioInjection(day=1, kind="roas_breach"), NOW)
    assert s.marketing.ads[ref].status == "active" and s.marketing.ads[ref].quality < 1
