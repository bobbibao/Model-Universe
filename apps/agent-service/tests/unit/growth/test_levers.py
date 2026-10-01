"""Estimators, allocation, brand lint and the in-flight guard."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta

from shop_agent.domain.growth.brand import BrandPolicy, lint_copy
from shop_agent.domain.growth.defaults import DEFAULT_PRIORS, GrowthDefaults, Priors
from shop_agent.domain.growth.estimators import (
    PromoItem,
    allocate,
    combine,
    estimate_ads,
    estimate_coupon,
    estimate_discount,
    estimate_post,
)
from shop_agent.domain.growth.guard import guard
from shop_agent.domain.growth.snapshot import Ad, AdDailyMetrics, BudgetPeriod, MarketingCampaign, Promotion
from tests.unit.growth.builders import NOW, TODAY, item, sales, snapshot

ITEMS = [PromoItem("A", 200_000, 120_000, daily_units=2, quantity=500)]


def test_discount_estimate_orders_its_points_and_counts_the_discount_cost() -> None:
    e = estimate_discount(ITEMS, 10, 7, DEFAULT_PRIORS)
    assert e.revenue_p10 <= e.revenue_p50 <= e.revenue_p90 and e.profit_p10 <= e.profit_p50 <= e.profit_p90
    assert e.discount_cost_vnd == round(2 * 7 * 200_000 * 0.1)
    bigger = estimate_discount(ITEMS, 30, 7, DEFAULT_PRIORS)
    assert bigger.revenue_p50 > e.revenue_p50  # deeper discount, more units
    no_stock = estimate_discount([replace(ITEMS[0], quantity=10)], 30, 7, DEFAULT_PRIORS)
    assert no_stock.revenue_p50 == 0  # nothing left to sell beyond the base


def test_coupon_post_and_ads_estimates() -> None:
    coupon = estimate_coupon(20, 500_000, 0.35, 10, 7, DEFAULT_PRIORS)
    assert coupon.profit_p10 <= coupon.profit_p50 <= coupon.profit_p90 and coupon.discount_cost_vnd > 0
    post = estimate_post(500_000, 0.35, DEFAULT_PRIORS)
    assert post.spend_vnd == 0 and post.revenue_p50 == round(600 * 0.012 * 0.02 * 500_000)
    ads = estimate_ads("google", 200_000, 5, 0.35, DEFAULT_PRIORS)
    assert ads.spend_vnd == 1_000_000 and ads.revenue_p50 == 3_000_000 and ads.profit_p50 == 50_000
    both = combine("campaign", [post, ads])
    assert both.spend_vnd == 1_000_000 and both.revenue_p50 == post.revenue_p50 + ads.revenue_p50
    assert combine("none", []).value == 0
    assert both.as_dict()["profit_vnd"] == {"p10": both.profit_p10, "p50": both.profit_p50, "p90": both.profit_p90}


def test_allocation_has_a_floor_and_never_gives_tiktok_money_without_a_video() -> None:
    shares = allocate(1_000_000, ["meta", "google", "tiktok"], DEFAULT_PRIORS, has_video=False)
    assert set(shares) == {"meta", "google"} and sum(shares.values()) <= 1_000_000
    assert min(shares.values()) >= 200_000 and shares["google"] > shares["meta"]
    with_video = allocate(1_000_000, ["meta", "google", "tiktok"], DEFAULT_PRIORS, has_video=True)
    assert with_video["tiktok"] >= 200_000 and sum(with_video.values()) <= 1_000_000
    assert allocate(0, ["meta"], DEFAULT_PRIORS, has_video=False) == {}


def test_priors_read_the_yaml_shape() -> None:
    priors = Priors.from_mapping({"ads": {"meta": {"mean": 2, "low": 1, "high": 3}}})
    assert priors.get("ads.meta").mean == 2
    assert priors.with_values({"ads.meta": DEFAULT_PRIORS.get("ads.google")}).get("ads.meta").mean == 3.0


def test_brand_lint_rules() -> None:
    policy = BrandPolicy(banned_terms=("rẻ bèo",), superlatives=("tốt nhất",), max_hashtags=2, max_emoji=1)
    assert lint_copy("Áo khoác mới, ấm áp cho mùa thu.", "post", policy) == []
    problems = lint_copy(
        "Áo rẻ bèo, tốt nhất hơn cả Shop Bên Kia! #a #b #c 🎉🎉 https://evil.example/x",
        "post",
        policy,
        competitors=["Shop Bên Kia"],
        shop_domain="shop.example.vn",
    )
    assert len(problems) == 6
    assert lint_copy("Buy new jackets now please", "post", policy) == ["not written in Vietnamese"]
    assert lint_copy("x" * 41, "headline", policy)[0].startswith("headline is longer")
    assert lint_copy("Xem tại https://www.shop.example.vn/a", "post", policy, shop_domain="shop.example.vn") == []


AD = Ad("ad-1", "ag-12345678-x", "meta", "active", "traffic", 100_000, 500_000, NOW, NOW + timedelta(days=4), NOW)


def _metrics(*rows: tuple[int, int, int]) -> tuple[AdDailyMetrics, ...]:
    return tuple(
        AdDailyMetrics(
            "ad-1", "ag-12345678-x", "meta", TODAY - timedelta(days=age), 0, 0, spend, 0, value, "active", "traffic"
        )
        for age, spend, value in rows
    )


def test_guard_pauses_overspending_and_low_roas_ads_and_everything_over_the_cap() -> None:
    d = GrowthDefaults()
    base = snapshot([item("A")], [], ads=(AD,))
    [over] = guard(replace(base, ad_metrics=_metrics((0, 130_000, 500_000))), d)
    assert over.rule == "overspend" and over.action.type == "pause_ad" and over.action.path_params == {"ref": "ad-1"}
    [poor] = guard(replace(base, ad_metrics=_metrics((1, 100_000, 50_000)) * 1 + _metrics((2, 450_000, 200_000))), d)
    assert poor.rule == "roas_floor"
    assert guard(replace(base, ad_metrics=_metrics((1, 600_000, 2_000_000))), d) == []
    capped = (BudgetPeriod("2026-10", 1_000_000, 1_000_000, 1_000_000, 0),)
    assert [f.rule for f in guard(replace(base, budget=capped), d)] == ["monthly_cap"]
    assert guard(replace(base, ads=(replace(AD, status="paused"),), budget=capped), d) == []


def test_guard_ends_a_promotion_that_loses_gross_profit() -> None:
    treated, controls = item("T"), [item(f"C{n}") for n in range(4)]
    started = TODAY - timedelta(days=5)
    # 20% off and no extra units: pure lost margin.
    rows = sales([treated, *controls], 30, lambda _i, _d: 2)
    rows = [replace(r, revenue_vnd=r.units * 160_000) if r.sku == "T" and r.day >= started else r for r in rows]
    promo = Promotion(
        "discount",
        "1",
        "T",
        20,
        NOW - timedelta(days=5),
        NOW + timedelta(days=5),
        None,
        "agent",
        "ag-12345678-p",
        0,
        None,
        None,
        True,
    )
    campaign = MarketingCampaign("ag-12345678-p", "promotion", "sales", None, "active", NOW, None, 0, "ag-12345678-p")
    snap = snapshot([treated, *controls], rows, promotions=(promo,), campaigns=(campaign,))
    [finding] = guard(snap, GrowthDefaults())
    assert finding.rule == "negative_promotion" and finding.action.type == "end_promotion"
    assert finding.action.path_params == {"ref": "ag-12345678-p"}
    young = replace(promo, starts_at=NOW - timedelta(days=1))
    assert guard(replace(snap, promotions=(young,)), GrowthDefaults()) == []
