"""FakeShop's marketing: a campaign saga under the web's rules, the budget ledger, metrics sync, revert, ingestion."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.domain.actions import ActionSpec
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.growth.marketing import (
    METRICS_SYNC_ENDPOINT,
    NOTIFICATIONS_ENDPOINT,
    OUTCOMES_ENDPOINT,
    AdminNotification,
    MetricsSync,
    Outcome,
)
from tests.support.factories import NOW, item

CAMPAIGN = "ag-1234abcd-o1"
AD = f"{CAMPAIGN}-meta"


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> Any:
        return self.now


def shop(clock: Clock | None = None) -> FakeShop:
    stock = {
        "A1": item("A1", days=150, cost=300_000, price=500_000),
        "A2": item("A2", days=150, cost=240_000, price=400_000),
    }
    return FakeShop(stock, [], {"A1": 1.0, "A2": 1.0}, clock=clock or (lambda: NOW))


def spec(action_type: str, body: dict[str, Any], *, ref: str | None = None, n: int = 1) -> ActionSpec:
    return ActionSpec(
        action_id=f"o1-{n}",
        type=action_type,
        body=body,
        path_params={"ref": ref} if ref else {},
        capability_hint=Capability.ADS_META if ref and action_type != "end_promotion" else None,
        idempotency_key=f"t1:o1:{n}",
    )


CAMPAIGN_BODY = {
    "ref": CAMPAIGN,
    "name": "Áo khoác gió",
    "objective": "sales",
    "channels": ["promotion", "facebook_post", "ads_meta"],
    "duration_days": 7,
    "budget_vnd": 1_500_000,
}
AD_BODY = {
    "ref": AD,
    "campaign_ref": CAMPAIGN,
    "platform": "meta",
    "daily_budget_vnd": 300_000,
    "duration_days": 5,
    "link_path": "/shop/product/1",
    "headline": "Áo khoác gió",
    "primary_text": "Nhẹ, chống nước.",
    "sku": "A1",
}


async def saga(fake: FakeShop) -> list[Any]:
    steps = [
        spec("create_campaign", CAMPAIGN_BODY, n=1),
        spec("apply_discount", {"skus": ["A1"], "percent": 15, "duration_days": 7, "campaign_ref": CAMPAIGN}, n=2),
        spec(
            "create_coupon",
            {"code": "AI-7F3A9C", "title": "Ưu đãi", "percent": 5, "duration_days": 7, "campaign_ref": CAMPAIGN},
            n=3,
        ),
        spec(
            "create_post",
            {"ref": f"{CAMPAIGN}-p1", "campaign_ref": CAMPAIGN, "message": "Áo khoác gió mới về.", "sku": "A1"},
            n=4,
        ),
        spec("create_ad", AD_BODY, n=5),
        spec("activate_ad", {}, ref=AD, n=6),
    ]
    return [await fake.execute(step) for step in steps]


async def test_a_campaign_saga_runs_and_shows_in_the_snapshot() -> None:
    fake = shop()
    results = await saga(fake)
    assert [r.ok for r in results] == [True] * 6, [r.detail for r in results]
    snap = await fake.growth_snapshot(NOW)
    assert [c.ref for c in snap.campaigns] == [CAMPAIGN] and snap.campaigns[0].kind == "mixed"
    assert {p.kind for p in snap.active_promotions()} == {"discount", "coupon"}
    [ad] = snap.ads
    assert (ad.status, ad.total_budget_vnd) == ("active", 1_500_000)
    assert snap.budget[0].reserved_vnd == 1_500_000 and [p.ref for p in snap.posts] == [f"{CAMPAIGN}-p1"]
    assert fake.discounts == {"A1": 15.0}


async def test_the_web_rules_apply_to_the_saga() -> None:
    fake = shop()
    await saga(fake)
    second = AD_BODY | {"ref": f"{CAMPAIGN}-meta2", "duration_days": 1}
    result = await fake.execute(spec("create_ad", second, n=7))
    assert (result.status_code, result.error_code) == (422, "limit_exceeded")  # the campaign's 1,500,000 is used
    assert "per-campaign" in result.detail


async def test_metrics_sync_records_spend_and_ends_a_spent_ad() -> None:
    clock = Clock()
    fake = shop(clock)
    await saga(fake)
    clock.now = NOW + timedelta(days=6)
    key = MetricsSync.idempotency_key(clock.now)
    result = await fake.ingest(METRICS_SYNC_ENDPOINT, MetricsSync(lookback_days=7).body(), idempotency_key=key)
    assert result.ok
    snap = await fake.growth_snapshot(clock.now)
    spend = sum(r.spend_vnd for r in snap.ad_metrics)
    assert 0 < spend <= 1_500_000 and all(r.clicks > 0 for r in snap.ad_metrics)
    assert snap.budget[0].spent_vnd == spend and snap.post_metrics
    replay = await fake.ingest(METRICS_SYNC_ENDPOINT, {"lookback_days": 7}, idempotency_key=key)
    assert replay == result


async def test_overspend_pauses_every_agent_ad() -> None:
    clock = Clock()
    fake = shop(clock)
    await saga(fake)
    world = await fake._world(NOW)  # the owner lowers the month's ad cap below what the ad spends
    world.scenario = world.scenario.model_copy(update={"settings": {"growth.caps": {"monthly_ad_cap_vnd": 1_000}}})
    await fake.ingest(METRICS_SYNC_ENDPOINT, {"lookback_days": 1}, idempotency_key="sync:1")
    assert fake.marketing.ads[AD].status == "paused"


async def test_reverting_an_ad_releases_its_reservation() -> None:
    fake = shop()
    await saga(fake)
    result = await fake.revert("t1:o1:5", idempotency_key="t1:o1:5:revert")
    assert result.ok and fake.marketing.ads[AD].status == "reverted"
    assert fake.marketing.budget().reserved_vnd == 0


async def test_protective_writes_run_with_the_kill_switch_on() -> None:
    fake = shop()
    await saga(fake)
    world = await fake._world(NOW)
    world.scenario = world.scenario.model_copy(update={"settings": {"growth.enabled": False}})
    refused = await fake.execute(spec("create_post", {"ref": f"{CAMPAIGN}-p2", "message": "Hi"}, n=8))
    assert (refused.status_code, refused.error_code) == (403, "agent_disabled")
    paused = await fake.execute(spec("pause_ad", {"reason": "kill switch"}, ref=AD, n=9))
    ended = await fake.execute(spec("end_promotion", {}, ref=CAMPAIGN, n=10))
    assert paused.ok and ended.ok and fake.marketing.ads[AD].status == "paused"
    snap = await fake.growth_snapshot(NOW)
    assert snap.active_promotions() == [] and fake.discounts == {}


async def test_outcomes_make_a_platform_measured_and_notifications_are_capped() -> None:
    fake = shop()
    outcome = Outcome(thread_id="t1", capability=Capability.ADS_META, verdict="positive", measured_at=NOW)
    assert (await fake.ingest(OUTCOMES_ENDPOINT, outcome.body(), idempotency_key=outcome.idempotency_key())).ok
    assert fake.marketing.measured_platforms() == {"meta"}
    sent = []
    for n in range(22):
        note = AdminNotification(subject=f"Cảnh báo {n}", message="...", dedupe_key="same" if n < 2 else None)
        result = await fake.ingest(NOTIFICATIONS_ENDPOINT, note.body(), idempotency_key=f"notify:{n}")
        sent.append(result.detail)
    assert sent[1] == "already sent today" and len(fake.marketing.notifications) == 20
