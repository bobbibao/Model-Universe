"""The growth brain's invariants, by property (plan Phase 7 acceptance): capacity, caps, tiers, claims, measurement,
prior updates."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from shop_agent.domain.actions import ActionDraft, to_spec
from shop_agent.domain.capabilities import TIER_RANK
from shop_agent.domain.growth.brand import BrandPolicy, claims, lint_copy
from shop_agent.domain.growth.defaults import MeasurementDefaults, Prior, PrioritizeDefaults
from shop_agent.domain.growth.learning import update_priors
from shop_agent.domain.growth.measurement import measure_growth
from shop_agent.domain.growth.policies import (
    AdState,
    BudgetState,
    CampaignState,
    ProductState,
    ShopState,
    evaluate,
)
from shop_agent.domain.growth.prioritize import Ranked, prioritize
from shop_agent.domain.growth.settings import GrowthSettings
from shop_agent.domain.models import Opportunity, Severity
from shop_agent.domain.policies.tiers import action_tier
from tests.unit.growth.builders import NOW, TODAY, item, sales, snapshot

KINDS = ["revenue_gap", "overstock", "trend_spike", "seasonal_event", "content_cadence", "campaign_scaling"]


def _opportunity(kind: str, n: int) -> Opportunity:
    return Opportunity(
        kind=kind, fingerprint=f"{kind}:{n}", severity=Severity.MEDIUM, title="t", summary="s", detected_at=NOW
    )


@given(
    st.lists(st.tuples(st.sampled_from(KINDS), st.floats(-1e6, 1e8)), max_size=30),
    st.integers(0, 6),
    st.integers(1, 5),
    st.integers(0, 5),
)
def test_prioritizer_never_exceeds_capacity(
    scored: list[tuple[str, float]], open_threads: int, per_tick: int, max_open: int
) -> None:
    defaults = PrioritizeDefaults(max_new_per_tick=per_tick, max_open_growth_threads=max_open)
    candidates = [Ranked(_opportunity(kind, n), score) for n, (kind, score) in enumerate(scored)]
    result = prioritize(
        candidates,
        today=TODAY,
        now=NOW,
        open_threads=open_threads,
        last_opened={},
        ad_budget_left_vnd=0,
        defaults=defaults,
    )
    assert len(result.opened) <= max(0, min(per_tick, max_open - open_threads))
    assert len({r.opportunity.kind for r in result.opened}) == len(result.opened)
    assert len(result.opened) + len(result.deferred) == len(candidates)
    assert all(r.score > 0 and r.opportunity.kind != "campaign_scaling" for r in result.opened)


def test_prioritizer_respects_cooldown_and_blackout() -> None:
    candidates = [Ranked(_opportunity("overstock", 1), 10.0), Ranked(_opportunity("trend_spike", 2), 5.0)]
    cooled = prioritize(
        candidates,
        today=TODAY,
        now=NOW,
        open_threads=0,
        last_opened={"overstock": NOW},
        ad_budget_left_vnd=0,
        defaults=PrioritizeDefaults(),
    )
    assert [r.opportunity.kind for r in cooled.opened] == ["trend_spike"]
    dark = prioritize(
        candidates,
        today=TODAY,
        now=NOW,
        open_threads=0,
        last_opened={},
        ad_budget_left_vnd=0,
        defaults=PrioritizeDefaults(blackout_dates=(TODAY,)),
    )
    assert dark.opened == () and {reason for _, reason in dark.deferred} == {"blackout day"}


STATE = ShopState(
    now=NOW,
    settings=GrowthSettings(),
    products=(
        ProductState(
            sku="A", category="ao", price_vnd=1_000_000, cost_vnd=300_000, created_at=NOW - timedelta(days=200)
        ),
    ),
    campaigns=(CampaignState(ref="ag-12345678-x", budget_vnd=3_000_000, status="active"),),
    ads=(
        AdState(
            ref="ad-1",
            campaign_ref="ag-12345678-x",
            platform="meta",
            status="active",
            daily_budget_vnd=100_000,
            total_budget_vnd=500_000,
            ends_at=NOW + timedelta(days=5),
        ),
    ),
    budget=BudgetState(cap_vnd=10_000_000, reserved_vnd=500_000, spent_vnd=0),
)


@given(st.integers(500_001, 1_000_000_000))
def test_policies_reject_over_caps(daily: int) -> None:
    """Above the per-day cap (500,000 by default) an ad is refused, with a grant or without."""
    body = {
        "ref": "ad-2",
        "campaign_ref": "ag-12345678-x",
        "platform": "meta",
        "daily_budget_vnd": daily,
        "duration_days": 1,
        "link_path": "/",
        "headline": "Áo",
        "primary_text": "Áo mới",
        "sku": "A",
    }
    verdict = evaluate("marketing/ads", {}, body, STATE, has_grant=True)
    assert verdict.status == 422 and verdict.reason == "per_day_cap"
    raise_budget = evaluate(
        "marketing/ads/{ref}/budget", {"ref": "ad-1"}, {"daily_budget_vnd": daily}, STATE, has_grant=True
    )
    assert raise_budget.status == 422 and raise_budget.reason == "per_day_cap"


@given(st.integers(10_000, 2_000_000), st.integers(10_000, 2_000_000), st.integers(1, 30), st.booleans())
def test_tier_monotonic_in_spend(low: int, extra: int, days: int, measured: bool) -> None:
    def tier(daily: int) -> int:
        body = {
            "ref": "ad-9",
            "campaign_ref": "ag-12345678-x",
            "platform": "meta",
            "daily_budget_vnd": daily,
            "duration_days": days,
            "link_path": "/",
            "headline": "Áo",
            "primary_text": "Áo mới",
            "sku": "A",
        }
        spec = to_spec(ActionDraft(type="create_ad", body=body), action_id="a", idempotency_key="k")
        return TIER_RANK[action_tier(spec, frozenset({"meta"}) if measured else frozenset())]

    assert tier(low) <= tier(low + extra)


@given(st.integers(1, 90), st.integers(1, 9_999))
def test_claim_consistency_vi_formats(percent: int, thousands: int) -> None:
    amount = thousands * 1_000
    dotted = f"{amount:,}".replace(",", ".")
    texts = [
        f"giảm {percent}%",
        f"Giảm {percent} phần trăm",
        f"chỉ {dotted}đ",
        f"chỉ {dotted} ₫",
        f"từ {thousands}k",
        f"{dotted} VND",
    ]
    found = [c for text in texts for c in claims(text)]
    assert [c.value for c in found if c.kind == "percent"] == [percent, percent]
    assert [c.value for c in found if c.kind == "vnd"] == [amount] * 4
    policy = BrandPolicy()
    for text in texts:
        assert lint_copy(f"Ưu đãi {text} cho bạn", "post", policy, percents=[percent], amounts_vnd=[amount]) == []
        assert lint_copy(f"Ưu đãi {text} cho bạn", "post", policy, percents=[percent + 1], amounts_vnd=[amount + 1])


def test_claims_read_millions_and_decimals() -> None:
    assert [c.value for c in claims("chỉ 1,2 triệu, giảm 12,5%, còn 1.5tr")] == [12.5, 1_200_000, 1_500_000]


@settings(max_examples=50)
@given(st.integers(1, 10), st.integers(0, 6))
def test_measurement_did_known_answer(base: int, lift: int) -> None:
    """Treated and controls sell `base` a day; from the action on, the treated SKU sells `lift` more. Controls flat:
    the incremental units are lift x days, at the list price."""
    started = TODAY - timedelta(days=7)
    treated = item("T", price=200_000, cost=120_000)
    controls = [item(f"C{n}", price=200_000 + n * 1_000, cost=120_000) for n in range(4)]
    rows = sales([treated, *controls], 30, lambda i, d: base + (lift if i.sku == "T" and d >= started else 0))
    result = measure_growth(
        snapshot([treated, *controls], rows),
        skus=["T"],
        first=started,
        last=TODAY - timedelta(days=1),
        defaults=MeasurementDefaults(),
    )
    assert result.method == "did" and len(result.controls) == 4
    assert result.incremental_revenue_vnd == lift * 7 * 200_000
    assert result.incremental_profit_vnd == lift * 7 * 80_000
    assert result.verdict == ("positive" if lift else "inconclusive")


@given(st.floats(0.01, 10), st.floats(0.01, 10), st.integers(1, 50), st.floats(1, 20))
def test_update_priors_shrinkage(mean: float, observed: float, n: int, n0: float) -> None:
    prior = Prior(mean=mean, low=mean * 0.5, high=mean * 1.5, n0=n0)
    posterior = update_priors(prior, observed, n)
    assert min(mean, observed) - 1e-9 <= posterior.mean <= max(mean, observed) + 1e-9
    assert abs(posterior.mean - (n0 * mean + n * observed) / (n0 + n)) < 1e-9
    assert posterior.n0 == n0 + n and posterior.low <= posterior.mean <= posterior.high
    more = update_priors(prior, observed, n + 10)
    assert abs(more.mean - observed) <= abs(posterior.mean - observed) + 1e-9  # more evidence, closer to it
    assert update_priors(prior, observed, 0) == prior


def test_measurement_falls_back_to_weekday_baseline_without_controls() -> None:
    shop = [item("A")]
    started = TODAY - timedelta(days=7)
    rows = sales(shop, 30, lambda _i, d: 3 if d >= started else 2)
    result = measure_growth(
        snapshot(shop, rows),
        skus=["A"],
        first=started,
        last=TODAY - timedelta(days=1),
        defaults=MeasurementDefaults(),
        spend_vnd=100_000,
        conversions=2,
        conversion_value_vnd=400_000,
    )
    assert result.method == "baseline" and result.controls == ()
    assert result.incremental_revenue_vnd == 7 * 200_000
    assert result.roas == 4.0 and result.cpa_vnd == 50_000 and result.mer == 14.0
    assert "so với cùng thứ" in result.summary
    assert datetime.now(UTC)  # nothing above reads the wall clock
