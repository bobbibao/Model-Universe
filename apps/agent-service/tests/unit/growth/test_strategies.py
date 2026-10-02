"""Growth options rebuilt by code: complete bodies with pre-assigned refs in saga order, levers inside the limits,
copy quoting only the executed numbers, and what a measured option teaches the priors."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta

import pytest

from shop_agent.domain.actions import to_spec
from shop_agent.domain.capabilities import RiskTier
from shop_agent.domain.growth.brand import BrandPolicy
from shop_agent.domain.growth.defaults import DEFAULT_PRIORS
from shop_agent.domain.growth.learning import learn_priors, observe
from shop_agent.domain.growth.measurement import GrowthMeasurement
from shop_agent.domain.growth.settings import GrowthCaps, GrowthSettings
from shop_agent.domain.growth.snapshot import (
    Ad,
    AdDailyMetrics,
    BudgetPeriod,
    GrowthSnapshot,
    MarketingAsset,
    MarketingOutcome,
    PostDailyMetrics,
)
from shop_agent.domain.growth.strategies import (
    GrowthFacts,
    campaign_ref,
    copy_problems,
    coupon_code,
    growth_menu,
    growth_tier,
    max_percent,
    opportunity_value,
    plan_growth,
    strategy_title,
)
from shop_agent.domain.models import Opportunity, Severity
from shop_agent.domain.options import DO_NOTHING, OptionNotApplicable
from tests.unit.growth.builders import NOW, TODAY, item, sales, snapshot

ITEMS = [item("A", quantity=300), item("B", quantity=300), item("NEW", created_days_ago=5)]
BUDGET = (BudgetPeriod("2026-10", 10_000_000, 0, 0, 10_000_000),)
SNAP = snapshot(ITEMS, sales(ITEMS, 60, lambda _i, _d: 2), budget=BUDGET)
THREAD = "0f4c2a9e-1111-2222-3333-444455556666"


def facts(snap: GrowthSnapshot = SNAP) -> GrowthFacts:
    return GrowthFacts(snap, THREAD)


def opportunity(kind: str, skus: tuple[str, ...] = ("A", "B"), **evidence: float | int | str) -> Opportunity:
    return Opportunity(kind=kind, fingerprint=f"{kind}:x", severity=Severity.MEDIUM, title="Cơ hội", summary="s",
                       evidence=evidence, skus=skus, detected_at=NOW)  # fmt: skip


def test_refs_are_stable_and_valid() -> None:
    assert campaign_ref(THREAD, "discount-post") == "ag-0f4c2a9e-discount-post"
    assert coupon_code(THREAD, "x") == coupon_code(THREAD, "x") != coupon_code(THREAD, "y")
    assert strategy_title("discount+post") == "Giảm giá + bài đăng Facebook" and strategy_title(DO_NOTHING)
    assert max_percent(item("M", price=200_000, cost=120_000), 15) == 29  # 141,176 is the lowest price


def test_campaign_bodies_are_complete_in_saga_order() -> None:
    plan = plan_growth(
        "dp", "discount+post+ads", {"percent": 10, "platform": "meta"}, opportunity("seasonal_event"), facts()
    )
    types = [a.type for a in plan.actions]
    assert types == ["create_campaign", "apply_discount", "create_post", "create_ad", "activate_ad"]
    ref = plan.actions[0].body["ref"]
    assert ref == "ag-0f4c2a9e-dp" and all(a.body.get("campaign_ref", ref) == ref for a in plan.actions[1:4])
    assert plan.actions[0].body["channels"] == ["promotion", "facebook_post", "ads_meta"]
    assert plan.actions[0].body["budget_vnd"] == 200_000 * 7
    assert plan.actions[4].path_params == {"ref": plan.actions[3].body["ref"]}
    assert "giảm 10%" in plan.actions[2].body["message"]
    for n, draft in enumerate(plan.actions, 1):  # every body validates against its endpoint's schema
        to_spec(draft, action_id=f"a{n}", idempotency_key=f"k{n}")
    assert plan.estimate.spend_vnd == 1_400_000 and plan.estimate.discount_cost_vnd > 0
    assert copy_problems(plan.actions, SNAP, BrandPolicy()) == []


def test_discounts_skip_new_arrivals_and_respect_the_margin_floor() -> None:
    plan = plan_growth("d", "discount", {"percent": 20}, opportunity("overstock", ("A", "NEW")), facts())
    assert plan.actions[1].body["skus"] == ["A"]
    with pytest.raises(OptionNotApplicable, match="margin floor"):
        plan_growth("d", "discount", {"percent": 35}, opportunity("overstock"), facts())
    with pytest.raises(ValueError, match="not SKUs of this opportunity"):
        plan_growth("d", "discount", {"skus": ["Z"]}, opportunity("overstock"), facts())
    with pytest.raises(ValueError, match="does not apply"):
        plan_growth("d", "discount", None, opportunity("rising_demand"), facts())  # no discount on rising demand


def test_coupon_quotes_its_code_minimum_and_percent() -> None:
    plan = plan_growth("c", "coupon+post", {"percent": 10, "min_order_vnd": 500_000}, opportunity("revenue_gap", ()),
                       facts())  # fmt: skip
    coupon, post = plan.actions[1].body, plan.actions[2].body
    assert coupon["code"] == coupon_code(THREAD, "c") and coupon["min_order_vnd"] == 500_000
    assert coupon["code"] in post["message"] and "500.000đ" in post["message"]
    assert copy_problems(plan.actions, SNAP, BrandPolicy()) == []
    wrong = [
        plan.actions[0],
        plan.actions[1],
        plan.actions[2].model_copy(update={"body": {**post, "message": "Giảm 30% hôm nay!"}}),
    ]
    assert any("30%" in p for p in copy_problems(wrong, SNAP, BrandPolicy()))


def test_ads_stay_inside_the_caps_and_need_a_video_on_tiktok() -> None:
    capped = replace(SNAP, settings=GrowthSettings(caps=GrowthCaps(per_day_vnd=100_000)))
    plan = plan_growth("a", "ads", {"platform": "google", "daily_budget_vnd": 900_000}, opportunity("trend_spike"),
                       facts(capped))  # fmt: skip
    ad = plan.actions[1].body
    assert ad["daily_budget_vnd"] == 100_000 and len(ad["headlines"]) >= 3 and ad["keywords"]
    with pytest.raises(OptionNotApplicable, match="video"):
        plan_growth("a", "ads", {"platform": "tiktok"}, opportunity("trend_spike"), facts())
    video = (MarketingAsset(7, "video", "https://cdn/x.mp4", "Video", None, NOW),)
    tiktok = plan_growth(
        "a", "ads", {"platform": "tiktok"}, opportunity("trend_spike"), facts(replace(SNAP, assets=video))
    )
    assert tiktok.actions[1].body["asset_id"] == 7
    spent = replace(SNAP, budget=(BudgetPeriod("2026-10", 1_000_000, 0, 990_000, 10_000),))
    with pytest.raises(OptionNotApplicable, match="ad budget"):
        plan_growth("a", "ads", None, opportunity("trend_spike"), facts(spent))
    assert plan_growth("a", "ads", None, opportunity("trend_spike"), facts()).actions[1].body["platform"] == "google"


def test_weekly_plan_splits_the_ad_budget_across_platforms() -> None:
    plan = plan_growth("w", "post+ads", None, opportunity("weekly_plan", ()), facts())
    platforms = [a.body["platform"] for a in plan.actions if a.type == "create_ad"]
    assert sorted(platforms) == ["google", "meta"]  # no TikTok without a video
    assert sum(a.body["daily_budget_vnd"] * a.body["duration_days"] for a in plan.actions if a.type == "create_ad") <= (
        200_000 * 7
    )


LIVE = Ad("ad-1", "ag-0f4c2a9e-a", "meta", "active", "traffic", 100_000, 700_000, NOW, NOW + timedelta(days=4), NOW)


def test_scaling_and_bidding_act_on_the_live_ad() -> None:
    live = replace(SNAP, ads=(LIVE,))
    scale = plan_growth("s", "scale_budget", None, opportunity("campaign_scaling", (), ad_ref="ad-1"), facts(live))
    assert scale.actions[0].type == "set_ad_budget" and scale.actions[0].body == {"daily_budget_vnd": 150_000}
    capped = plan_growth("s", "scale_budget", {"daily_budget_vnd": 9_000_000},
                         opportunity("campaign_scaling", (), ad_ref="ad-1"), facts(live))  # fmt: skip
    assert capped.actions[0].body == {"daily_budget_vnd": 500_000}
    switch = plan_growth("b", "switch_bidding", None, opportunity("bidding_upgrade", (), ad_ref="ad-1"), facts(live))
    assert switch.actions[0].body == {"objective": "conversions"} and switch.estimate.profit_p50 > 0
    with pytest.raises(OptionNotApplicable, match="not running"):
        plan_growth("s", "scale_budget", None, opportunity("campaign_scaling", (), ad_ref="ad-9"), facts(live))


def test_menu_value_and_tier() -> None:
    menu = growth_menu(opportunity("overstock"), facts())
    assert [p.strategy for p in menu][-1] == DO_NOTHING and len(menu) >= 3
    assert opportunity_value(opportunity("overstock"), facts()) == max(p.estimate.value for p in menu)
    post = plan_growth("p", "post", None, opportunity("content_cadence"), facts())
    assert growth_tier(post.actions, SNAP) is RiskTier.LOW
    ads = plan_growth("a", "ads", {"platform": "meta"}, opportunity("rising_demand"), facts())
    assert growth_tier(ads.actions, SNAP) is RiskTier.HIGH  # the platform's first campaign
    measured = replace(SNAP, outcomes=(MarketingOutcome("t", None, "ads_meta", "positive", 1, 1, 1, 0.6, NOW),))
    assert growth_tier(ads.actions, measured) is RiskTier.MEDIUM  # measured, but 7 days is above the low caps (5)


def test_observe_reads_roas_post_reach_and_uplift() -> None:
    plan = plan_growth(
        "dp", "discount+post+ads", {"percent": 10, "platform": "meta"}, opportunity("seasonal_event"), facts()
    )
    actions = [to_spec(d, action_id=f"a{n}", idempotency_key=f"k{n}") for n, d in enumerate(plan.actions, 1)]
    ad_ref, post_ref = actions[3].body["ref"], actions[2].body["ref"]
    first, last = TODAY - timedelta(days=7), TODAY - timedelta(days=1)
    ad_rows = tuple(
        AdDailyMetrics(ad_ref, None, "meta", first + timedelta(days=n), 1000, 20, 100_000, 1, 300_000, "active", None)
        for n in range(7)
    )
    post_rows = (PostDailyMetrics(post_ref, None, first, 800, 600, 40, 16, NOW),)
    snap = replace(SNAP, ad_metrics=ad_rows, post_metrics=post_rows)
    did = GrowthMeasurement("did", 7, 280_000, 50_000, 700_000, 3.0, 0.4, 100_000, ("C1", "C2", "C3"), 0.65, "positive")
    observed = observe(snap, actions, did, first, last)
    assert observed["ads.meta"] == 3.0 and observed["post.views"] == 800 and observed["post.click_rate"] == 0.02
    assert observed["promotion.uplift_per_pct"] > 0
    learned = learn_priors(DEFAULT_PRIORS, {**observed, "unknown.prior": 1.0})
    assert set(learned) == {"ads.meta", "post.views", "post.click_rate", "promotion.uplift_per_pct"}
    assert learned["ads.meta"].n0 == 6 and DEFAULT_PRIORS.get("ads.meta").mean < learned["ads.meta"].mean < 3.0
    baseline = replace(did, method="baseline")
    assert "promotion.uplift_per_pct" not in observe(snap, actions, baseline, first, last)
