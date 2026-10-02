"""The improvement graph on growth kinds (plan Phase 7): autonomy tiers, shadow, the brand judge, grants, measurement.

The world is tests/graphs/conftest.py's small shop with the baseline growth scenario. Opportunities are built here, so
each test controls exactly what the planner is offered.
"""

from __future__ import annotations

from typing import Any

from shop_agent.domain.capabilities import Capability
from shop_agent.domain.growth.snapshot import MarketingOutcome
from shop_agent.domain.models import Opportunity, Severity
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings
from shop_agent.graphs.improvement import GROWTH, PRIORS_KEY
from tests.graphs.conftest import World


def growth_opportunity(world: World, kind: str, skus: tuple[str, ...], **evidence: Any) -> Opportunity:
    return Opportunity(
        kind=kind,
        fingerprint=f"{kind}:test",
        severity=Severity.MEDIUM,
        title="Cơ hội tăng trưởng",
        summary="Kiểm thử",
        evidence=evidence,
        skus=skus,
        detected_at=world.clock(),
    )


def allow(world: World, **modes: AutonomyMode) -> None:
    """The owner approved the brand guide and set these capabilities' modes."""
    world.shop.settings["brand.approved"] = True
    world.shop.autonomy = AutonomySettings({Capability(c): m for c, m in modes.items()})


def proposing(strategy: str, **params: Any) -> list[dict[str, Any]]:
    option = {"option_id": strategy.replace("+", "-"), "strategy": strategy, "rationale": "Theo dữ liệu.", **params}
    proposal = {
        "summary": "Đề xuất",
        "causes": [{"text": "Dữ liệu cho thấy cơ hội.", "confidence": 0.6}],
        "options": [option, {"option_id": "do_nothing", "strategy": "do_nothing", "rationale": "So sánh."}],
        "recommended_option_id": option["option_id"],
        "confidence": 0.6,
    }
    return [{"tool_calls": [{"name": "Proposal", "args": proposal}]}]


def shop_changes(world: World) -> list[Any]:
    return [s for s in world.shop.sent if not s.endpoint.startswith(("marketing/outcomes", "marketing/metrics"))]


FAILING_JUDGE = [{"structured": {"scores": [
    {"criterion": "voice", "score": 2, "note": "Không đúng giọng văn."},
    {"criterion": "truthful", "score": 4, "note": ""},
    {"criterion": "clarity", "score": 4, "note": ""},
    {"criterion": "rules", "score": 4, "note": ""},
]}}]  # fmt: skip


async def test_low_tier_auto_post_runs_without_interrupt(world: World) -> None:
    allow(world, facebook_post=AutonomyMode.AUTO_LOW)
    result = await world.run(
        {"opportunity": growth_opportunity(world, "content_cadence", ("BEST",)).model_dump(mode="json")}
    )
    assert "__interrupt__" not in result
    values = await world.values()
    assert values["stage"] == "measuring" and values["decision"]["mode"] == "auto"
    sent = shop_changes(world)
    assert [s.endpoint for s in sent] == ["marketing/campaigns", "marketing/posts"]
    assert all(s.applied and not s.grant for s in sent)  # the web's auto_low rule, no grant
    option = next(o for o in values["options"] if o["option_id"] == values["decision"]["option_id"])
    assert option["brand"]["passed"] and option["tier"] == "low"


async def test_low_tier_auto_promotion_runs_without_interrupt(world: World, scripts: Any) -> None:
    allow(world, promotion=AutonomyMode.AUTO_LOW)
    scripts({"improvement.investigate.overstock": proposing("discount", percent=10, duration_days=7)})
    result = await world.run({"opportunity": growth_opportunity(world, "overstock", ("OLD1",)).model_dump(mode="json")})
    assert "__interrupt__" not in result
    sent = shop_changes(world)
    assert [s.endpoint for s in sent] == ["marketing/campaigns", "pricing/discounts"]
    assert sent[1].body["skus"] == ["OLD1"] and sent[1].body["percent"] == 10
    assert sent[1].body["campaign_ref"] == sent[0].body["ref"]


async def test_first_platform_ad_interrupts_and_the_grant_is_forwarded(world: World, scripts: Any) -> None:
    allow(world, ads_meta=AutonomyMode.AUTO_LOW)
    world.shop.settings["growth.caps"] = {"monthly_ad_cap_vnd": 5_000_000}
    scripts({"improvement.investigate.rising_demand": proposing("ads", platform="meta", daily_budget_vnd=200_000)})
    result = await world.run(
        {"opportunity": growth_opportunity(world, "rising_demand", ("BEST",)).model_dump(mode="json")}
    )
    payload = world.review(result)  # a platform's first campaign is high: a person decides
    option = world.option(payload)
    assert option["tier"] == "high" and option["total_vnd"] == 200_000 * 7  # what the approver types
    assert [a["type"] for a in option["actions"]] == ["create_campaign", "create_ad", "activate_ad"]
    assert shop_changes(world) == []
    await world.approve(payload)
    sent = shop_changes(world)
    assert [s.endpoint.split("/")[-1] for s in sent] == ["campaigns", "ads", "activate"]
    assert all(s.applied and s.grant for s in sent)


async def test_medium_tier_ad_interrupts(world: World, scripts: Any) -> None:
    allow(world, ads_meta=AutonomyMode.AUTO_LOW)
    world.shop.settings["growth.caps"] = {"monthly_ad_cap_vnd": 5_000_000}
    world.shop.marketing.outcomes.append(  # Meta already has a measured campaign: not the first one
        MarketingOutcome("t0", None, "ads_meta", "positive", 1, 1, 1, 0.6, world.clock())
    )
    scripts({"improvement.investigate.rising_demand": proposing("ads", platform="meta", duration_days=7)})
    result = await world.run(
        {"opportunity": growth_opportunity(world, "rising_demand", ("BEST",)).model_dump(mode="json")}
    )
    assert world.option(world.review(result))["tier"] == "medium"  # 7 days is above the low-risk 5
    assert shop_changes(world) == []


async def test_shadow_mode_never_writes(world: World) -> None:
    # The brand guide is not approved: every growth capability is in shadow, whatever its mode.
    world.shop.autonomy = AutonomySettings({Capability.FACEBOOK_POST: AutonomyMode.AUTO_LOW})
    result = await world.run(
        {"opportunity": growth_opportunity(world, "content_cadence", ("BEST",)).model_dump(mode="json")}
    )
    assert "__interrupt__" not in result
    values = await world.values()
    assert (values["outcome"], values["stage"]) == ("shadow", "closed")
    assert shop_changes(world) == []


async def test_two_brand_failures_need_a_person_even_in_auto_mode(world: World, scripts: Any) -> None:
    allow(world, facebook_post=AutonomyMode.AUTO_LOW)
    scripts({"improvement.brand_judge": FAILING_JUDGE})
    result = await world.run(
        {"opportunity": growth_opportunity(world, "content_cadence", ("BEST",)).model_dump(mode="json")}
    )
    payload = world.review(result)
    option = world.option(payload)
    assert option["needs_human"] and not option["brand"]["passed"]
    values = await world.values()
    assert values["investigations"] == 3 and values["brand_revisions"] == 2
    assert shop_changes(world) == []


async def test_edited_copy_must_quote_the_executed_numbers(world: World, scripts: Any) -> None:
    allow(world, promotion=AutonomyMode.ASK, facebook_post=AutonomyMode.ASK)
    scripts({"improvement.investigate.overstock": proposing("discount+post", percent=10)})
    result = await world.run({"opportunity": growth_opportunity(world, "overstock", ("OLD1",)).model_dump(mode="json")})
    payload = world.review(result)
    edited = await world.approve(payload, {"message": "Giảm 30% cho áo khoác!"})
    assert "edited copy" in world.review(edited)["error"]
    assert shop_changes(world) == []


async def test_measure_records_outcomes_per_capability_and_moves_priors(world: World, scripts: Any) -> None:
    allow(world, promotion=AutonomyMode.ASK, facebook_post=AutonomyMode.ASK)
    scripts({"improvement.investigate.overstock": proposing("discount+post", percent=10, duration_days=7)})
    result = await world.run({"opportunity": growth_opportunity(world, "overstock", ("OLD1",)).model_dump(mode="json")})
    await world.approve(world.review(result))
    values = await world.values()
    assert values["stage"] == "measuring"
    world.clock.advance(days=14)  # 7 days of flight + 7 of measurement
    post_ref = next(s.body["ref"] for s in world.shop.sent if s.endpoint == "marketing/posts")
    world.shop.marketing.sync(world.clock(), 7)  # the post's reach since it went live
    await world.run({"wake": "followup_due"})
    values = await world.values()
    assert values["stage"] == "closed" and values["measurement"]["method"] in ("did", "baseline")
    outcomes = {o.capability: o for o in world.shop.marketing.outcomes}
    assert set(outcomes) == {"promotion", "facebook_post"}
    measured = values["measurement"]
    # The costliest lever carries the figures; the others record the verdict only (the fake stores 0 for none).
    assert outcomes["promotion"].incremental_revenue_vnd == measured["incremental_revenue_vnd"]
    assert outcomes["facebook_post"].incremental_revenue_vnd == 0 and outcomes["facebook_post"].spend_vnd == 0
    if any(m.post_ref == post_ref and m.impressions for m in world.shop.marketing.post_metrics.values()):
        priors = await world.store.aget(GROWTH, PRIORS_KEY)
        assert priors is not None and priors.value["post.views"]["n0"] > 5
