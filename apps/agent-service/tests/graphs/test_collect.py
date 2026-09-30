"""The `collect` graph on FakeShop: one post per source per day, dry runs post nothing, flags turn sources off."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver

from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.adapters.market import MarketCollector
from shop_agent.adapters.market.fixture import FixtureCollector
from shop_agent.domain.growth.market import MarketObservations, SourceName
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.graphs import collect
from shop_agent.tools.deps import ShopDeps

NOW = datetime(2026, 9, 29, 23, 45, tzinfo=UTC)  # the cron: 06:45 in Vietnam


@dataclass
class CountingCollector:
    source: SourceName
    calls: list[datetime] = field(default_factory=list)

    async def collect(self, snapshot: GrowthSnapshot) -> MarketObservations:
        self.calls.append(snapshot.taken_at)
        return MarketObservations(source=self.source, status="degraded", observed_at=snapshot.taken_at, detail="429")


def setup(
    enabled: frozenset[str] = frozenset({"fixture", "trends", "competitor_sites"}),
) -> tuple[FakeShop, collect.CollectContext, dict[str, Any]]:
    shop = FakeShop.seed_demo(lambda: NOW)
    collectors: dict[str, MarketCollector] = {
        "fixture": FixtureCollector(),
        "trends": CountingCollector("trends"),
        "competitor_sites": CountingCollector("competitor_sites"),
    }
    deps = ShopDeps(reader=shop, writer=shop, clock=lambda: NOW)
    return shop, collect.CollectContext(deps, collectors, enabled), collectors


async def run(context: collect.CollectContext, state: collect.State | None = None) -> dict[str, Any]:
    graph = collect.build().compile(checkpointer=InMemorySaver())
    result: dict[str, Any] = await graph.ainvoke(
        state or {}, {"configurable": {"thread_id": "collect"}}, context=context
    )
    return result


async def test_cron_run_posts_each_default_source_once() -> None:
    shop, context, _ = setup()
    out = await run(context)
    assert [r["source"] for r in out["results"]] == ["trends", "competitor_sites"]
    assert all(r["posted"] for r in out["results"])
    assert [w.idempotency_key for w in shop.sent] == [
        "collect:trends:2026-09-30",
        "collect:competitor_sites:2026-09-30",
    ]
    snap = await shop.growth_snapshot(NOW)
    assert {s.name: s.status for s in snap.sources} == {"trends": "degraded", "competitor_sites": "degraded"}


async def test_a_source_that_reported_today_is_not_read_again() -> None:
    shop, context, collectors = setup()
    await run(context)
    out = await run(context)
    assert [r.get("skipped") for r in out["results"]] == ["already reported today"] * 2
    assert len(collectors["trends"].calls) == 1 and len(shop.sent) == 2


async def test_dry_run_posts_nothing() -> None:
    shop, context, _ = setup()
    out = await run(context, {"sources": ["fixture"], "dry_run": True})
    [result] = out["results"]
    assert result["posted"] is False and result["trends"] == 3 and result["competitor_prices"] > 0
    assert shop.sent == [] and out["observations"][0]["source"] == "fixture"


async def test_a_flagged_off_source_reports_off_without_reading() -> None:
    _, context, collectors = setup(enabled=frozenset({"fixture", "trends"}))
    out = await run(context, {"sources": ["competitor_sites"]})
    [result] = out["results"]
    assert result["status"] == "off" and result["posted"]
    assert collectors["competitor_sites"].calls == []


async def test_unknown_sources_are_reported() -> None:
    shop, context, _ = setup()
    out = await run(context, {"sources": ["marketplace"]})
    assert out["results"] == [{"source": "marketplace", "skipped": "unknown source"}] and shop.sent == []


async def test_fixture_observations_reach_the_snapshot() -> None:
    shop, context, _ = setup()
    before = await shop.growth_snapshot(NOW)
    await run(context, {"sources": ["fixture"]})
    after = await shop.growth_snapshot(NOW)
    assert len(after.competitor_prices) > len(before.competitor_prices)
    assert after.watch_list() == before.watch_list()
