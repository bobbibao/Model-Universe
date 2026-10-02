"""Growth suite: the growth planner on a FakeShop with the Q4 scenario, validated and brand-checked by code, as the
review shows it.

Runs exactly what the graph's investigate and validate steps run (`load_facts`, `investigation_message`,
`investigate`, `validate_options`, `brand_review`). Each case sets up the shop (settings, a thin-margin SKU, a live
ad, a video, a competitor's text) and names the opportunity (kind, which SKUs, evidence).
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

from evals.evaluators import CaseOutput
from shop_agent.adapters.fake_marketing import AdRecord, CampaignRecord
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.agents.investigator import investigate
from shop_agent.agents.kinds import get_kind
from shop_agent.domain.growth.policies import state_from_snapshot
from shop_agent.domain.growth.snapshot import CompetitorPrice, MarketingAsset
from shop_agent.domain.models import Opportunity, Severity
from shop_agent.graphs.improvement import brand_review, investigation_message, load_facts, validate_options
from shop_agent.tools.deps import ShopDeps

NOW = datetime(2026, 10, 15, 2, 0, tzinfo=UTC)  # 09:00 in Vietnam


def _skus(shop: FakeShop, which: str, now: datetime) -> tuple[str, ...]:
    items = sorted(shop.stock.values(), key=lambda i: (-shop.base_daily.get(i.sku, 0.0), i.sku))
    if which == "sellers":
        return tuple(i.sku for i in items[:5])
    if which == "slow":
        return tuple(i.sku for i in sorted(items, key=lambda i: (shop.base_daily.get(i.sku, 0.0), i.sku))[:5])
    if which == "new":
        return tuple(i.sku for i in items if i.days_in_stock < 14)[:5]
    if which == "thin":
        return items[0].sku, items[1].sku
    return ()


def build(case: dict[str, Any]) -> tuple[FakeShop, Opportunity, datetime]:
    now = datetime.fromisoformat(case["now"]) if case.get("now") else NOW
    shop = FakeShop.seed_demo(lambda: now, seed=int(case.get("seed", 7)))
    shop.scenario = "q4"
    shop.settings.update(case.get("settings", {}))
    skus = _skus(shop, case.get("skus", "sellers"), now)
    thin = shop.stock if case.get("thin_margin") else skus if case.get("skus") == "thin" else ()
    for sku in thin:  # a cost that leaves about 18% gross margin (the SKUs', or the whole shop's)
        item = shop.stock[sku]
        shop.stock[sku] = replace(item, unit_cost_vnd=round(item.unit_price_vnd * 0.82))
    if case.get("video"):
        shop.marketing.assets.append(MarketingAsset(1, "video", "https://cdn.example/v.mp4", "Video", None, now))
    evidence = dict(case.get("evidence", {}))
    if case.get("live_ad"):
        m, started = shop.marketing, now - timedelta(days=3)
        m.campaigns["ag-evalads0-x"] = CampaignRecord("ag-evalads0-x", "Quảng cáo", "traffic", ["ads_meta"], None,
                                                      started, now + timedelta(days=4), 3_000_000)  # fmt: skip
        m.ads["a-evalads0-meta"] = AdRecord("a-evalads0-meta", "ag-evalads0-x", "meta", "traffic", 150_000,
                                            1_050_000, started, now + timedelta(days=4), status="active",
                                            activated_at=started, reserved_vnd=1_050_000)  # fmt: skip
        evidence["ad_ref"] = "a-evalads0-meta"
    opportunity = Opportunity(
        kind=case["kind"],
        fingerprint=f"{case['kind']}:eval:{case['id']}",
        severity=Severity(case.get("severity", "medium")),
        title=case.get("title", "Cơ hội tăng trưởng"),
        summary=case.get("summary", "Cơ hội tăng trưởng do bộ phát hiện tìm thấy."),
        evidence=evidence,
        skus=skus,
        detected_at=now,
    )
    return shop, opportunity, now


def _margin_pct(shop: FakeShop, body: dict[str, Any]) -> float:
    """The lowest gross margin after this discount over its SKUs."""
    margins = []
    for sku in body.get("skus") or []:
        item = shop.stock[sku]
        price = item.unit_price_vnd * (1 - float(body["percent"]) / 100)
        margins.append((price - item.unit_cost_vnd) / price * 100 if price > 0 else -100.0)
    return min(margins, default=100.0)


async def run_case(case: dict[str, Any], profile: str) -> CaseOutput:
    shop, opportunity, now = build(case)
    deps = ShopDeps(reader=shop, writer=shop, clock=lambda: now, model_profile=profile)
    world = await shop._world(now)
    if case.get("competitor_title"):  # untrusted text in the data: a competitor's product title
        sku = opportunity.skus[0]
        world.competitor_prices.append(
            CompetitorPrice(
                "Đối thủ",
                None,
                sku,
                None,
                False,
                "manual",
                str(case["competitor_title"]),
                round(shop.stock[sku].unit_price_vnd * 0.8),
                now - timedelta(hours=1),
                1.0,
            )
        )
    facts = await load_facts(deps, f"eval-{case['id']}", None)
    message = investigation_message(opportunity, deps, facts, responses=case.get("owner_notes", []))
    proposal, messages = await investigate(
        get_kind(opportunity.kind), message, context=deps, script_key=f"improvement.investigate.{opportunity.kind}"
    )
    options, ids = validate_options(proposal, opportunity, deps, facts, state_from_snapshot(facts.growth))
    await brand_review(options, facts)
    viable = [o for o in options if o.viable]
    shown = []
    for o in viable:
        platforms = [str(a.body["platform"]) for a in o.actions if a.type == "create_ad"]
        discounts = [_margin_pct(shop, a.body) for a in o.actions if a.type == "apply_discount"]
        texts = [a for a in o.actions if a.type in ("create_post", "create_ad", "create_coupon")]
        shown.append({
            "option_id": o.option_id,
            "strategy": o.strategy,
            "levers": sorted(set(o.strategy.split("+")) | set(platforms)),
            "tier": o.tier.value,
            "copy": bool(texts),
            "brand_passed": bool(o.brand.get("passed", not texts)) and not o.needs_human,
            "min_margin_pct": min(discounts, default=100.0),
        })  # fmt: skip
    recommended = next((o for o in shown if o["option_id"] == ids.get(proposal.recommended_option_id)), None)
    structured = {
        "options": shown,
        "recommended_strategy": recommended["strategy"] if recommended else None,
        "recommended_levers": recommended["levers"] if recommended else [],
        "recommended_valid": recommended is not None,
        "proposal": proposal.model_dump(),
    }
    text = [proposal.summary, *(c.text for c in proposal.causes), *(o.rationale for o in proposal.options)]
    return CaseOutput(messages=messages, structured=structured, final_text="\n".join(text))
