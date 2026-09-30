"""The growth snapshot: FakeWorld builds it deterministically, the views' rows map onto it, the domain reads it."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest

from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.adapters.fake_world import FakeWorld, Scenario, ScenarioProduct, load_scenario
from shop_agent.adapters.growth_rows import GROWTH_VIEWS, SNAPSHOT_VIEWS, to_growth_snapshot
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.growth.market import MARKET_OBSERVATIONS_ENDPOINT, MarketObservations, TrendObservation
from shop_agent.domain.growth.pacing import goal_pacing, weekday_weights
from shop_agent.domain.growth.settings import GrowthSettings
from shop_agent.domain.growth.snapshot import (
    CompetitorPrice,
    DailySales,
    GrowthSnapshot,
    GrowthTargets,
    MarketEvent,
    TrendPoint,
    vn_date,
)
from shop_agent.domain.policies.autonomy import AutonomyMode

NOW = datetime(2026, 9, 29, 2, 0, tzinfo=UTC)  # 09:00 in Vietnam
PRODUCTS = (
    ScenarioProduct(
        sku="A", name="Áo A", category="ao", price_vnd=200_000, unit_cost_vnd=120_000, quantity=40, daily_units=3
    ),
    ScenarioProduct(
        sku="B", name="Giày B", category="giay", price_vnd=900_000, unit_cost_vnd=600_000, quantity=5, daily_units=0.5
    ),
)


def scenario(**overrides: Any) -> Scenario:
    return Scenario(name="test", catalog=PRODUCTS, **overrides)


def world(**overrides: Any) -> FakeWorld:
    return FakeWorld.generate(scenario(**overrides), NOW, events=())


def price(url: str, day: int, amount: int, *, watch: bool = False, sku: str | None = "A") -> CompetitorPrice:
    return CompetitorPrice(
        competitor="Đối thủ",
        competitor_website="https://rival.example",
        sku=sku,
        url=url,
        watch=watch,
        source="manual",
        title=None,
        price_vnd=amount,
        observed_at=NOW - timedelta(days=day),
        confidence=1.0,
    )


def test_vn_date_is_the_day_in_vietnam() -> None:
    assert vn_date(datetime(2026, 9, 30, 16, 59, tzinfo=UTC)) == date(2026, 9, 30)
    assert vn_date(datetime(2026, 9, 30, 17, 0, tzinfo=UTC)) == date(2026, 10, 1)


def test_fake_world_is_deterministic_for_a_seed() -> None:
    first, second = world().snapshot(NOW), world().snapshot(NOW)
    assert first.sales_daily == second.sales_daily and first.sku_sales_daily == second.sku_sales_daily
    assert world(seed=8).snapshot(NOW).sku_sales_daily != first.sku_sales_daily


def test_history_ends_yesterday_and_new_products_start_when_added() -> None:
    fresh = ScenarioProduct(
        sku="N", name="Mới", category="ao", price_vnd=100_000, unit_cost_vnd=50_000, quantity=10, daily_units=5,
        created_days_ago=10,
    )  # fmt: skip
    snap = FakeWorld.generate(Scenario(name="t", catalog=(*PRODUCTS, fresh)), NOW, events=()).snapshot(NOW)
    assert max(d.day for d in snap.sales_daily) == snap.today - timedelta(days=1)
    first_sale = min(row.day for row in snap.sku_sales_daily if row.sku == "N")
    assert first_sale >= snap.today - timedelta(days=10)


def test_event_uplift_raises_sales_inside_the_window() -> None:
    event = MarketEvent("sale_day", "Ngày hội", NOW.date() - timedelta(days=40), NOW.date() - timedelta(days=34), 14)
    flat = FakeWorld.generate(scenario(seed=3), NOW, events=(event,)).snapshot(NOW)
    boosted = FakeWorld.generate(scenario(seed=3, event_uplift={"sale_day": 3.0}), NOW, events=(event,)).snapshot(NOW)

    def units(snap: GrowthSnapshot) -> int:
        return sum(d.units for d in snap.sales_between(event.starts_on, event.ends_on))

    assert units(boosted) > 2 * units(flat)


def test_auto_targets_follow_the_trailing_three_months() -> None:
    snap = world().snapshot(NOW)
    assert snap.targets is not None
    month = snap.today.replace(day=1)
    months = [(month - timedelta(days=1)).replace(day=1)]
    for _ in range(2):
        months.append((months[-1] - timedelta(days=1)).replace(day=1))
    totals = [sum(d.revenue_vnd for d in snap.sales_daily if d.day.replace(day=1) == m) for m in months]
    trailing = round(sum(totals) / 3)
    assert snap.targets.trailing_monthly_revenue_vnd == trailing
    assert snap.targets.revenue_target_vnd == round(trailing * 1.1)
    assert snap.targets.revenue_target_source == "auto_trailing_3m"
    assert snap.targets.monthly_ad_cap_vnd == min(10_000_000, round(trailing * 0.05))


def test_owner_settings_override_the_auto_targets() -> None:
    settings = {"growth.goal": {"revenue_target_vnd": 99_000_000}, "growth.caps": {"monthly_ad_cap_vnd": 2_000_000}}
    targets = world(settings=settings).snapshot(NOW).targets
    assert targets is not None
    assert (targets.revenue_target_vnd, targets.revenue_target_source) == (99_000_000, "owner")
    assert (targets.monthly_ad_cap_vnd, targets.monthly_ad_cap_source) == (2_000_000, "owner")


def test_settings_default_to_the_contract_values() -> None:
    settings = GrowthSettings.from_values({})
    assert settings.growth_enabled and not settings.brand_approved and not settings.two_person_approval
    assert settings.goal.margin_floor_pct == 15 and settings.caps.per_day_vnd == 500_000
    assert settings.autonomy[Capability.PROMOTION] is AutonomyMode.ASK
    assert settings.autonomy[Capability.ADS_META] is AutonomyMode.SHADOW


def test_latest_prices_and_the_watch_list() -> None:
    snap = GrowthSnapshot(
        taken_at=NOW,
        competitor_prices=(
            price("https://rival.example/a", 8, 210_000),
            price("https://rival.example/a", 1, 190_000, watch=True),
            price("https://rival.example/b", 2, 500_000, sku="B"),
        ),
    )
    latest = {p.url: p.price_vnd for p in snap.latest_competitor_prices()}
    assert latest == {"https://rival.example/a": 190_000, "https://rival.example/b": 500_000}
    assert [p.url for p in snap.watch_list()] == ["https://rival.example/a"]


def test_upcoming_events_and_trend_series() -> None:
    today = vn_date(NOW)
    events = (
        MarketEvent("past", "Đã qua", today - timedelta(days=9), today - timedelta(days=2), 7),
        MarketEvent("running", "Đang diễn ra", today - timedelta(days=1), today + timedelta(days=1), 7),
        MarketEvent("soon", "Sắp tới", today + timedelta(days=20), today + timedelta(days=21), 14),
        MarketEvent("later", "Còn xa", today + timedelta(days=60), today + timedelta(days=61), 14),
    )
    trends = tuple(TrendPoint("áo", "VN", today - timedelta(days=n), 50 + n, "fixture") for n in (3, 1, 2))
    snap = GrowthSnapshot(taken_at=NOW, events=events, trends=trends)
    assert [e.code for e in snap.upcoming_events(30)] == ["running", "soon"]
    assert [p.interest for p in snap.trend_series("áo")] == [53, 52, 51]


def _sales(first: date, last: date, per_day: int) -> tuple[DailySales, ...]:
    days = (last - first).days + 1
    return tuple(DailySales(first + timedelta(days=n), 10, 12, per_day, 0, per_day // 3, 4) for n in range(days))


def test_goal_pacing_known_answer() -> None:
    # 30-day month, flat weekdays (too little history for weights), 1,000,000 a day for 14 days, today is the 15th.
    now = datetime(2026, 9, 15, 3, 0, tzinfo=UTC)
    targets = GrowthTargets(date(2026, 9, 1), 20_000_000, 30_000_000, "owner", 1_000_000, "owner")
    snap = GrowthSnapshot(taken_at=now, sales_daily=_sales(date(2026, 9, 1), date(2026, 9, 14), 1_000_000),
                          targets=targets)  # fmt: skip
    pacing = goal_pacing(snap)
    assert pacing.month_to_date_vnd == 14_000_000
    assert pacing.expected_to_date_vnd == 15_000_000  # 15 of 30 days, today included
    assert pacing.gap_pct == pytest.approx(-1 / 15) and pacing.behind


def test_goal_pacing_without_a_target() -> None:
    pacing = goal_pacing(GrowthSnapshot(taken_at=NOW))
    assert pacing.target_vnd is None and pacing.expected_to_date_vnd is None and not pacing.behind


def test_weekday_weights_follow_the_history() -> None:
    snap = world(weekday_factors=(1, 1, 1, 1, 1, 3, 1)).snapshot(NOW)
    weights = weekday_weights(snap)
    assert weights[5] == max(weights) and weights[5] > 2 * weights[0]


def test_view_rows_map_onto_the_snapshot() -> None:
    rows: dict[str, list[dict[str, Any]]] = {view: [] for view in SNAPSHOT_VIEWS}
    rows["sales_daily"] = [
        {"day": datetime(2026, 9, 28), "orders": 3, "units": 4, "revenue_vnd": 600_000, "coupon_discount_vnd": 20_000,
         "gross_profit_vnd": 200_000, "attributed_orders": 1},
    ]  # fmt: skip
    rows["agent_settings"] = [{"key": "growth.enabled", "value": False}, {"key": "brand.approved", "value": True}]
    rows["growth_targets"] = [
        {"month": date(2026, 9, 1), "trailing_monthly_revenue_vnd": None, "revenue_target_vnd": None,
         "revenue_target_source": "none", "monthly_ad_cap_vnd": 0, "monthly_ad_cap_source": "none"},
    ]  # fmt: skip
    snap = to_growth_snapshot(NOW, rows)
    assert snap.sales_daily[0].day == date(2026, 9, 28) and snap.sales_daily[0].revenue_vnd == 600_000
    assert not snap.settings.growth_enabled and snap.settings.brand_approved
    assert snap.targets is not None and snap.targets.revenue_target_source == "none"


def test_every_snapshot_view_is_described() -> None:
    assert set(SNAPSHOT_VIEWS) <= set(GROWTH_VIEWS)
    assert "orders_attributed" in GROWTH_VIEWS and "orders_attributed" not in SNAPSHOT_VIEWS


def test_the_baseline_scenario_loads() -> None:
    from shop_agent.adapters.fake_world import SCENARIOS_DIR

    baseline = load_scenario(SCENARIOS_DIR / "baseline.yaml")
    assert baseline.seed == 7 and baseline.trends and baseline.competitors


# ------------------------------------------------------------------------------------------------ FakeShop ingestion


def observations(interest: int = 60) -> MarketObservations:
    return MarketObservations(
        source="trends",
        observed_at=NOW,
        trends=(TrendObservation(keyword="áo khoác", date=date(2026, 9, 28), interest=interest),),
    )


@pytest.fixture
def shop() -> FakeShop:
    return FakeShop.seed_demo(lambda: NOW)


async def test_ingest_records_observations_in_the_world(shop: FakeShop) -> None:
    body = observations()
    result = await shop.ingest(MARKET_OBSERVATIONS_ENDPOINT, body.body(), idempotency_key=body.idempotency_key())
    assert result.ok, result.detail
    snap = await shop.growth_snapshot(NOW)
    assert [p.interest for p in snap.trend_series("áo khoác") if p.day == date(2026, 9, 28)] == [60]
    assert {s.name: s.status for s in snap.sources}["trends"] == "ok"


async def test_ingest_replays_a_key_and_refuses_it_with_another_body(shop: FakeShop) -> None:
    body = observations()
    key = body.idempotency_key()
    first = await shop.ingest(MARKET_OBSERVATIONS_ENDPOINT, body.body(), idempotency_key=key)
    again = await shop.ingest(MARKET_OBSERVATIONS_ENDPOINT, body.body(), idempotency_key=key)
    assert again == first and len(shop.sent) == 1
    other = await shop.ingest(MARKET_OBSERVATIONS_ENDPOINT, observations(61).body(), idempotency_key=key)
    assert not other.ok and other.status_code == 409


async def test_ingest_refuses_an_unknown_endpoint(shop: FakeShop) -> None:
    result = await shop.ingest("market/nope", observations().body(), idempotency_key="k")
    assert not result.ok and result.status_code == 404


def test_the_collector_key_is_the_day_in_vietnam() -> None:
    late = MarketObservations(source="competitor_sites", observed_at=datetime(2026, 9, 30, 18, 0, tzinfo=UTC))
    assert late.idempotency_key() == "collect:competitor_sites:2026-10-01"
