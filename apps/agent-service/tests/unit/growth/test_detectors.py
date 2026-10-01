"""Growth detectors: each fires on its situation and stays quiet otherwise; fingerprints are stable."""

from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.detectors import GROWTH_DETECTORS, detect_growth
from shop_agent.domain.growth.detectors.ads import BiddingUpgradeDetector, CampaignScalingDetector
from shop_agent.domain.growth.detectors.content import ContentCadenceDetector, NewArrivalsDetector
from shop_agent.domain.growth.detectors.demand import OverstockDetector, RisingDemandDetector
from shop_agent.domain.growth.detectors.goal import RevenueGapDetector
from shop_agent.domain.growth.detectors.market import (
    CompetitorCampaignDetector,
    CompetitorUndercutDetector,
    SeasonalEventDetector,
    TrendSpikeDetector,
)
from shop_agent.domain.growth.settings import GrowthSettings, TrendKeyword
from shop_agent.domain.growth.snapshot import (
    Ad,
    AdDailyMetrics,
    BudgetPeriod,
    CompetitorCampaign,
    CompetitorPrice,
    ConversionStats,
    GrowthTargets,
    MarketEvent,
    MarketingCampaign,
    Post,
    TrendPoint,
)
from tests.unit.growth.builders import NOW, TODAY, item, sales, snapshot

D = GrowthDefaults()
ITEMS = [item("A", quantity=40), item("B", quantity=30), item("C", category="giay", price=900_000, cost=600_000)]
STEADY = sales(ITEMS, 60, lambda i, _d: 2)


def test_every_kind_has_one_detector() -> None:
    kinds = [d.kind for d in GROWTH_DETECTORS]
    assert len(kinds) == len(set(kinds)) == 11


def test_the_kill_switch_detects_nothing() -> None:
    snap = snapshot(ITEMS, STEADY, settings=GrowthSettings(growth_enabled=False), posts=())
    assert detect_growth(snap, D) == []


def test_revenue_gap_needs_a_target_a_gap_and_a_few_days_of_the_month() -> None:
    month_to_date = sum(r.revenue_vnd for r in STEADY if r.day >= TODAY.replace(day=1))
    behind = GrowthTargets(TODAY.replace(day=1), None, month_to_date * 4, "owner", 0, "none")
    snap = snapshot(ITEMS, STEADY, targets=behind)
    [gap] = RevenueGapDetector().detect(snap, D)
    assert gap.severity == "high" and float(gap.evidence["gap_pct"]) < -25
    assert RevenueGapDetector().detect(replace(snap, targets=None), D) == []
    on_pace = GrowthTargets(TODAY.replace(day=1), None, month_to_date * 2, "owner", 0, "none")
    assert RevenueGapDetector().detect(replace(snap, targets=on_pace), D) == []
    early = replace(snap, taken_at=NOW - timedelta(days=13))  # the 2nd of the month
    assert RevenueGapDetector().detect(early, D) == []


def test_overstock_groups_slow_selling_skus_by_category() -> None:
    items = [item("A", quantity=500), item("B", quantity=10), item("N", quantity=500, created_days_ago=3)]
    snap = snapshot(items, sales(items, 60, lambda i, _d: 1))
    [opportunity] = OverstockDetector().detect(snap, D)
    assert opportunity.skus == ("A",)  # B has 10 days of cover; N is a new arrival
    assert opportunity.evidence["category"] == "ao"


def test_rising_demand_compares_7_and_28_day_velocity() -> None:
    stocked = [replace(i, quantity=400) for i in ITEMS]
    rows = sales(stocked, 60, lambda i, d: 6 if i.category == "ao" and d >= TODAY - timedelta(days=7) else 2)
    [opportunity] = RisingDemandDetector().detect(snapshot(stocked, rows), D)
    assert opportunity.evidence["category"] == "ao" and float(opportunity.evidence["ratio"]) >= 1.5
    assert RisingDemandDetector().detect(snapshot(stocked, STEADY), D) == []
    assert RisingDemandDetector().detect(snapshot(ITEMS, rows), D) == []  # 70 units last 6 days: not enough cover


def test_competitor_undercut_needs_a_fresh_price_well_below_ours() -> None:
    def price(amount: int, hours: int) -> CompetitorPrice:
        return CompetitorPrice(
            "Đối thủ",
            None,
            "A",
            "https://rival.example/a",
            False,
            "manual",
            "Áo",
            amount,
            NOW - timedelta(hours=hours),
            1.0,
        )

    [opportunity] = CompetitorUndercutDetector().detect(
        snapshot(ITEMS, STEADY, competitor_prices=(price(170_000, 5),)), D
    )
    assert opportunity.skus == ("A",) and opportunity.evidence["max_gap_pct"] == 15.0
    assert CompetitorUndercutDetector().detect(snapshot(ITEMS, STEADY, competitor_prices=(price(190_000, 5),)), D) == []
    stale = (price(150_000, 80),)
    assert CompetitorUndercutDetector().detect(snapshot(ITEMS, STEADY, competitor_prices=stale), D) == []


def test_competitor_campaign_in_one_of_our_categories() -> None:
    running = CompetitorCampaign(
        "Đối thủ", "Giảm 30% giày", "giay", 30, NOW - timedelta(days=1), NOW + timedelta(days=5), None, "manual", NOW
    )
    [opportunity] = CompetitorCampaignDetector().detect(snapshot(ITEMS, STEADY, competitor_campaigns=(running,)), D)
    assert opportunity.severity == "high" and opportunity.skus == ("C",)
    elsewhere = replace(running, category="tui")
    assert CompetitorCampaignDetector().detect(snapshot(ITEMS, STEADY, competitor_campaigns=(elsewhere,)), D) == []
    ended = replace(running, ends_at=NOW - timedelta(hours=1))
    assert CompetitorCampaignDetector().detect(snapshot(ITEMS, STEADY, competitor_campaigns=(ended,)), D) == []


def test_trend_spike_on_a_mapped_keyword_with_fresh_data() -> None:
    def series(recent: int) -> tuple[TrendPoint, ...]:
        return tuple(
            TrendPoint("áo", "VN", TODAY - timedelta(days=age), recent if age <= 7 else 40, "fixture")
            for age in range(14, 0, -1)
        )

    settings = GrowthSettings(trend_keywords=(TrendKeyword(keyword="áo", category="ao"),))
    [opportunity] = TrendSpikeDetector().detect(snapshot(ITEMS, STEADY, trends=series(60), settings=settings), D)
    assert opportunity.evidence["change_pct"] == 50.0
    assert TrendSpikeDetector().detect(snapshot(ITEMS, STEADY, trends=series(50), settings=settings), D) == []
    assert TrendSpikeDetector().detect(snapshot(ITEMS, STEADY, trends=series(60)), D) == []  # not mapped


def test_seasonal_event_inside_its_lead_window_without_a_plan() -> None:
    event = MarketEvent("black_friday", "Black Friday", TODAY + timedelta(days=10), TODAY + timedelta(days=12), 14)
    [opportunity] = SeasonalEventDetector().detect(snapshot(ITEMS, STEADY, events=(event,)), D)
    assert opportunity.evidence["event_code"] == "black_friday" and opportunity.evidence["days_left"] == 10
    planned = MarketingCampaign(
        "ag-12345678-bf", "mixed", "sales", None, "active", NOW, NOW + timedelta(days=14), 0, "ag-12345678-bf"
    )
    assert SeasonalEventDetector().detect(snapshot(ITEMS, STEADY, events=(event,), campaigns=(planned,)), D) == []
    far = replace(event, starts_on=TODAY + timedelta(days=30), ends_on=TODAY + timedelta(days=31))
    assert SeasonalEventDetector().detect(snapshot(ITEMS, STEADY, events=(far,)), D) == []


def test_content_cadence_and_new_arrivals_read_the_last_post() -> None:
    fresh = [*ITEMS, item("N", created_days_ago=3)]
    snap = snapshot(fresh, STEADY)
    assert [o.kind for o in ContentCadenceDetector().detect(snap, D)] == ["content_cadence"]
    [arrivals] = NewArrivalsDetector().detect(snap, D)
    assert arrivals.skus == ("N",)
    posted = Post("p1", None, "facebook", "published", None, NOW - timedelta(days=1))
    assert ContentCadenceDetector().detect(replace(snap, posts=(posted,)), D) == []
    assert NewArrivalsDetector().detect(replace(snap, posts=(posted,)), D) == []


def _ad(objective: str = "traffic") -> Ad:
    return Ad(
        "ad-1", "ag-12345678-x", "meta", "active", objective, 200_000, 1_000_000, NOW, NOW + timedelta(days=5), NOW
    )


def _metrics(value: int) -> tuple[AdDailyMetrics, ...]:
    return tuple(
        AdDailyMetrics("ad-1", None, "meta", TODAY - timedelta(days=d), 0, 0, 100_000, 1, value, "active", "traffic")
        for d in range(1, 4)
    )


def test_campaign_scaling_needs_a_high_roas_and_budget_left() -> None:
    budget = (BudgetPeriod("2026-10", 10_000_000, 2_000_000, 300_000, 8_000_000),)
    snap = snapshot(ITEMS, STEADY, ads=(_ad(),), ad_metrics=_metrics(400_000), budget=budget)
    [opportunity] = CampaignScalingDetector().detect(snap, D)
    assert opportunity.evidence["roas"] == 4.0
    assert CampaignScalingDetector().detect(replace(snap, ad_metrics=_metrics(200_000)), D) == []
    empty = (BudgetPeriod("2026-10", 10_000_000, 10_000_000, 0, 0),)
    assert CampaignScalingDetector().detect(replace(snap, budget=empty), D) == []


def test_bidding_upgrade_on_a_traffic_ad_with_enough_purchases() -> None:
    snap = snapshot(ITEMS, STEADY, ads=(_ad(),), conversion_stats=(ConversionStats("meta", 50, 120),))
    assert [o.kind for o in BiddingUpgradeDetector().detect(snap, D)] == ["bidding_upgrade"]
    assert BiddingUpgradeDetector().detect(replace(snap, ads=(_ad("conversions"),)), D) == []
    assert BiddingUpgradeDetector().detect(replace(snap, conversion_stats=(ConversionStats("meta", 49, 120),)), D) == []


def test_fingerprints_are_stable_for_the_same_situation() -> None:
    event = MarketEvent("tet", "Tết", TODAY + timedelta(days=5), TODAY + timedelta(days=9), 14)
    snap = snapshot(ITEMS, STEADY, events=(event,))
    first = [o.fingerprint for o in detect_growth(snap, D)]
    assert first == [o.fingerprint for o in detect_growth(snap, D)]
    assert date.today()  # the detectors read the snapshot's clock only
