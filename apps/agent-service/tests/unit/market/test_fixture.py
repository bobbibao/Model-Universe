"""The fixture source: deterministic, no network, and it never touches the watch list."""

from __future__ import annotations

from datetime import timedelta

from shop_agent.adapters.market.fixture import FixtureCollector
from shop_agent.domain.growth.snapshot import CompetitorPrice
from tests.unit.market.conftest import NOW, snapshot, watched


def unwatched(url: str, amount: int) -> CompetitorPrice:
    return CompetitorPrice(
        "Giày Việt Store", None, "SKU-2", url, False, "csv", "Giày", amount, NOW - timedelta(days=2), 0.9
    )


async def test_fixture_is_deterministic_and_leaves_watched_pages_alone() -> None:
    snap = snapshot(
        watched("https://an-nhien.example/p/1"),
        unwatched("https://giayviet.example/products/sku-2", 1_000_000),
        keywords=("giày thể thao",),
    )
    first, second = await FixtureCollector().collect(snap), await FixtureCollector().collect(snap)
    assert first == second and first.source == "fixture"
    [price] = first.competitor_prices
    assert price.url == "https://giayviet.example/products/sku-2"
    assert 970_000 <= price.price_vnd <= 1_030_000 and price.price_vnd % 1_000 == 0
    [trend] = first.trends
    assert trend.date == snap.today - timedelta(days=1) and 37 <= trend.interest <= 43
