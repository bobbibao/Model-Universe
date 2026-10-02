"""Growth options (docs/GROWTH_AGENT.md section 1): the levers an opportunity may pull, and each option's complete
Agent API bodies and estimate.

The planner (an LLM) picks a strategy from its kind's menu, the parameters and the copy; everything here is
deterministic. A strategy is a set of levers run as one campaign, sent in the saga order campaign -> discounts ->
coupon -> post -> ads -> activate. Every ref is assigned here, so the bodies are complete when a person approves them:
campaign `ag-<thread8>-<option>`, post `p-<thread8>-<option>`, ad `a-<thread8>-<option>-<platform>`, coupon
`AI-<hash(thread, option)>`. Copy the planner did not write is a plain template that quotes the executed numbers.
"""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from shop_agent.domain.actions import AD_CAPABILITY, ActionDraft, ActionSpec, to_spec
from shop_agent.domain.capabilities import Capability, RiskTier, max_tier
from shop_agent.domain.growth.brand import BrandPolicy, TextKind, lint_copy
from shop_agent.domain.growth.defaults import DEFAULT_PRIORS, GrowthDefaults, Prior, Priors
from shop_agent.domain.growth.demand import average_order_vnd, gross_margin_ratio, sellable_items, window
from shop_agent.domain.growth.estimators import (
    GrowthEstimate,
    PromoItem,
    allocate,
    combine,
    estimate_ads,
    estimate_coupon,
    estimate_discount,
    estimate_post,
)
from shop_agent.domain.growth.estimators.common import confidence_of
from shop_agent.domain.growth.policies import NEW_ARRIVAL_DAYS, check_option, state_from_snapshot
from shop_agent.domain.growth.snapshot import CatalogItem, GrowthSnapshot
from shop_agent.domain.models import Opportunity
from shop_agent.domain.options import DO_NOTHING, OptionNotApplicable, OptionPlan
from shop_agent.domain.policies.autonomy import AutonomyMode
from shop_agent.domain.policies.tiers import action_tier

LEVERS = ("discount", "coupon", "post", "ads")  # also the saga order
SCALE_BUDGET = "scale_budget"
SWITCH_BIDDING = "switch_bidding"
PLATFORMS = ("meta", "google", "tiktok")

# The strategies each growth kind's options may use (docs/GROWTH_AGENT.md section 1, "Candidate levers").
KIND_STRATEGIES: dict[str, tuple[str, ...]] = {
    "revenue_gap": ("coupon+post", "post+ads", "post"),
    "overstock": ("discount+post", "discount", "post+ads"),
    "rising_demand": ("post+ads", "post", "ads"),  # no discount on what already sells
    "competitor_undercut": ("discount", "post"),
    "competitor_campaign": ("coupon+post", "post"),
    "trend_spike": ("post+ads", "ads", "post"),
    "seasonal_event": ("discount+post+ads", "coupon+post", "post"),
    "content_cadence": ("post",),
    "new_arrivals": ("post+ads", "post"),  # new arrivals are never discounted
    "campaign_scaling": (SCALE_BUDGET,),
    "bidding_upgrade": (SWITCH_BIDDING,),
    "weekly_plan": ("post+ads", "post"),
}
LEVER_TITLES = {
    "discount": "giảm giá",
    "coupon": "mã giảm giá",
    "post": "bài đăng Facebook",
    "ads": "quảng cáo",
    SCALE_BUDGET: "tăng ngân sách quảng cáo",
    SWITCH_BIDDING: "tối ưu quảng cáo theo đơn hàng",
}
TARGET_SKUS = 5  # SKUs a campaign without SKUs of its own features (top sellers)
DEFAULT_PERCENT = 10
DEFAULT_DAYS = 7
DEFAULT_AD_DAILY_VND = 200_000
MIN_AD_DAILY_VND = 50_000
SCALE_FACTOR = 1.5
SCALE_ROAS_LOW = 0.7  # more budget buys less efficient traffic: the low end of a scaled ad's ROAS
BUDGET_STEP_VND = 10_000
Params = dict[str, Any]


@dataclass(frozen=True)
class GrowthFacts:
    """What growth options are planned from: one snapshot, the thread (refs), the defaults and the priors."""

    snapshot: GrowthSnapshot
    thread_id: str
    defaults: GrowthDefaults = field(default_factory=GrowthDefaults)
    priors: Priors = DEFAULT_PRIORS


def strategy_title(strategy: str) -> str:
    if strategy == DO_NOTHING:
        return "Không làm gì"
    names = [LEVER_TITLES.get(lever, lever) for lever in strategy.split("+")]
    text = " + ".join(names)
    return text[:1].upper() + text[1:]


def strategies_for(kind: str) -> tuple[str, ...]:
    return KIND_STRATEGIES.get(kind, ())


# ------------------------------------------------------------------------------------------------ helpers


def _slug(text: str, length: int) -> str:
    return re.sub(r"[^a-z0-9_-]", "-", text.lower())[:length].strip("-_") or "x"


def campaign_ref(thread_id: str, option_id: str) -> str:
    thread8 = (re.sub(r"[^a-z0-9]", "", thread_id.lower()) + "00000000")[:8]
    return f"ag-{thread8}-{_slug(option_id, 40)}"


def coupon_code(thread_id: str, option_id: str) -> str:
    return "AI-" + hashlib.sha256(f"{thread_id}:{option_id}".encode()).hexdigest()[:8].upper()


def dotted_vnd(amount: int) -> str:
    """199000 -> "199.000đ", the way the shop writes prices."""
    return f"{amount:,}".replace(",", ".") + "đ"


def _floor_to(amount: float, step: int) -> int:
    return int(amount // step * step)


def max_percent(item: CatalogItem, margin_floor_pct: float) -> int:
    """The deepest whole percent that keeps the margin floor over cost (policies' margin rule)."""
    if item.price_vnd <= 0:
        return 0
    floor = margin_floor_pct / 100
    lowest_price = item.unit_cost_vnd / (1 - floor) if floor < 1 else math.inf
    return max(0, math.floor((1 - lowest_price / item.price_vnd) * 100 + 1e-9))


def units_by_sku(snapshot: GrowthSnapshot, days: int) -> dict[str, int]:
    """Units sold per SKU over the last `days` complete days (one pass over the history)."""
    first, last = window(snapshot, days)
    units: dict[str, int] = {}
    for row in snapshot.sku_sales_daily:
        if first <= row.day <= last:
            units[row.sku] = units.get(row.sku, 0) + row.units
    return units


def _top_sellers(snapshot: GrowthSnapshot, category: str) -> list[CatalogItem]:
    units = units_by_sku(snapshot, 30)
    items = [i for i in sellable_items(snapshot) if not category or i.category == category]
    items.sort(key=lambda i: (-units.get(i.sku, 0), i.sku))
    return items[:TARGET_SKUS]


def target_items(opportunity: Opportunity, snapshot: GrowthSnapshot, chosen: Sequence[str] | None) -> list[CatalogItem]:
    """The SKUs an option features: the opportunity's own (or the chosen subset of them), else top sellers."""
    own = [i for i in sellable_items(snapshot) if i.sku in set(opportunity.skus)]
    pool = own if opportunity.skus else _top_sellers(snapshot, str(opportunity.evidence.get("category", "")))
    if chosen:
        wanted = set(chosen)
        unknown = sorted(wanted - {i.sku for i in pool})
        if unknown:
            raise ValueError(f"skus {unknown} are not SKUs of this opportunity")
        pool = [i for i in pool if i.sku in wanted]
    return pool


def _link_path(items: Sequence[CatalogItem]) -> str:
    categories = {i.category for i in items}
    return f"/shop?category={next(iter(categories))}" if len(categories) == 1 else "/shop"


def _names(items: Sequence[CatalogItem]) -> str:
    names = [i.name for i in items[:3]]
    return ", ".join(names) + (" và nhiều sản phẩm khác" if len(items) > 3 else "")


def _ad_budget(snapshot: GrowthSnapshot, days: int, wanted: int | None) -> int:
    """A daily budget inside the owner's per-day and per-campaign caps and the month's remaining budget."""
    caps = snapshot.settings.caps
    remaining = snapshot.budget[-1].remaining_vnd if snapshot.budget else 0
    ceiling = min(caps.per_day_vnd, caps.per_campaign_vnd // days, remaining // days)
    daily = _floor_to(min(wanted if wanted is not None else DEFAULT_AD_DAILY_VND, ceiling), BUDGET_STEP_VND)
    if daily < MIN_AD_DAILY_VND:
        raise OptionNotApplicable("not enough ad budget left this month")
    return daily


def enabled_platforms(snapshot: GrowthSnapshot) -> tuple[str, ...]:
    """Ad platforms whose capability the owner has not switched off (an `off` capability is never proposed)."""
    modes = snapshot.settings.autonomy
    return tuple(p for p in PLATFORMS if modes.get(AD_CAPABILITY[p], AutonomyMode.ASK) is not AutonomyMode.OFF)


def _video(snapshot: GrowthSnapshot) -> int | None:
    videos = [a.asset_id for a in snapshot.assets if a.kind == "video"]
    return videos[-1] if videos else None


def _default_platform(opportunity: Opportunity, facts: GrowthFacts) -> str:
    enabled = enabled_platforms(facts.snapshot)
    if opportunity.kind == "trend_spike" and "google" in enabled:
        return "google"  # people are searching: Search ads
    shares = allocate(1_000_000, enabled, facts.priors, has_video=_video(facts.snapshot) is not None, floor=0)
    if not shares:
        raise OptionNotApplicable("no ad platform is switched on")
    return max(shares, key=lambda p: (shares[p], p))


# ------------------------------------------------------------------------------------------------ copy


@dataclass(frozen=True)
class Offer:
    """What the copy may quote: the executed numbers."""

    percent: float | None = None
    code: str | None = None
    min_order_vnd: int | None = None
    days: int = DEFAULT_DAYS


def default_message(items: Sequence[CatalogItem], offer: Offer) -> str:
    names = _names(items) or "Sản phẩm của cửa hàng"
    if offer.code and offer.percent is not None:
        minimum = f" cho đơn từ {dotted_vnd(offer.min_order_vnd)}" if offer.min_order_vnd else ""
        return f"Nhập mã {offer.code} để được giảm {offer.percent:g}%{minimum}, áp dụng {offer.days} ngày. {names}."
    if offer.percent is not None:
        return f"{names}: giảm {offer.percent:g}% trong {offer.days} ngày. Xem ngay tại cửa hàng."
    return f"{names} đang có tại cửa hàng. Ghé xem ngay."


def _ad_copy(platform: str, items: Sequence[CatalogItem], message: str, params: Params) -> dict[str, Any]:
    if platform == "meta":
        first = items[0].name if items else "Cửa hàng"
        return {"headline": params.get("headline") or first[:40], "primary_text": params.get("primary_text") or message}
    if platform == "google":
        defaults = list(dict.fromkeys([*(i.name[:30] for i in items), *(i.category_name[:30] for i in items)]))
        headlines = params.get("headlines") or [*defaults, "Mua sắm tại cửa hàng"][:3]
        descriptions = params.get("descriptions") or [message[:90], "Xem thêm sản phẩm tại cửa hàng."]
        names = [*(i.name for i in items), *(i.category_name for i in items)]
        keywords = params.get("keywords") or list(dict.fromkeys(n.lower()[:80] for n in names))[:10]
        return {"headlines": headlines, "descriptions": descriptions, "keywords": keywords}
    return {"ad_text": params.get("ad_text") or message[:100]}


# ------------------------------------------------------------------------------------------------ levers


def _discount(items: list[CatalogItem], percent: float, facts: GrowthFacts, days: int) -> list[CatalogItem]:
    """The SKUs a discount may run on: not new arrivals, not already discounted, room above the margin floor."""
    snapshot = facts.snapshot
    floor = snapshot.settings.goal.margin_floor_pct
    new_after = snapshot.taken_at - timedelta(days=NEW_ARRIVAL_DAYS)
    eligible = [
        i
        for i in items
        if i.created_at <= new_after and i.discount_pct == 0 and max_percent(i, floor) >= percent and i.quantity > 0
    ]
    if not eligible:
        raise OptionNotApplicable(f"no SKU can take {percent:g}% off above the margin floor of {floor:g}%")
    return eligible


def _promo_items(items: Sequence[CatalogItem], snapshot: GrowthSnapshot) -> list[PromoItem]:
    units = units_by_sku(snapshot, 28)
    return [PromoItem(i.sku, i.price_vnd, i.unit_cost_vnd, units.get(i.sku, 0) / 28, i.quantity) for i in items]


def _number(params: Params, name: str, default: float, low: float, high: float) -> float:
    value = params.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int | float) or not low <= value <= high:
        raise ValueError(f"{name} must be a number between {low:g} and {high:g}")
    return float(value)


def _plan_campaign(
    option_id: str, strategy: str, params: Params, opportunity: Opportunity, facts: GrowthFacts
) -> OptionPlan[GrowthEstimate]:
    levers = strategy.split("+")
    if not levers or any(lever not in LEVERS for lever in levers) or len(set(levers)) != len(levers):
        raise ValueError(f"unknown strategy {strategy!r}")
    if "discount" in levers and "coupon" in levers:
        raise ValueError("a discount and a coupon do not run in the same option")
    snapshot, thread_id = facts.snapshot, facts.thread_id
    days = int(_number(params, "duration_days", DEFAULT_DAYS, 1, 30))
    items = target_items(opportunity, snapshot, params.get("skus"))
    if not items and ("discount" in levers or "ads" in levers):
        raise OptionNotApplicable("no sellable SKU in stock to feature")
    margin = gross_margin_ratio(snapshot)
    order_vnd = average_order_vnd(snapshot)
    ref = campaign_ref(thread_id, option_id)
    parts: list[GrowthEstimate] = []
    actions: list[ActionDraft] = []
    channels: list[Capability] = []
    offer = Offer(days=days)
    out: Params = {"duration_days": days}

    if "discount" in levers:
        percent = _number(params, "percent", DEFAULT_PERCENT, 1, 50)
        items = _discount(items, percent, facts, days)
        parts.append(estimate_discount(_promo_items(items, snapshot), percent, days, facts.priors))
        actions.append(
            ActionDraft(
                type="apply_discount",
                body={"skus": [i.sku for i in items], "percent": percent, "duration_days": days, "campaign_ref": ref},
                description=f"Giảm {percent:g}% cho {len(items)} mã trong {days} ngày",
            )
        )
        channels.append(Capability.PROMOTION)
        offer = Offer(percent=percent, days=days)
        out |= {"percent": percent, "skus": [i.sku for i in items]}
    if "coupon" in levers:
        percent = int(_number(params, "percent", DEFAULT_PERCENT, 1, 50))
        minimum = int(params.get("min_order_vnd") or _floor_to(order_vnd, 50_000) or 50_000)
        code = coupon_code(thread_id, option_id)
        daily_orders = (
            sum(r.orders for r in snapshot.sales_between(snapshot.today - timedelta(days=28), snapshot.today)) / 28
        )
        parts.append(estimate_coupon(daily_orders, order_vnd, margin, percent, days, facts.priors))
        actions.append(
            ActionDraft(
                type="create_coupon",
                body={
                    "code": code,
                    "title": f"Giảm {percent}% cho đơn từ {dotted_vnd(minimum)}",
                    "percent": percent,
                    "duration_days": days,
                    "min_order_vnd": minimum,
                    "campaign_ref": ref,
                },
                description=f"Mã {code}: giảm {percent}% cho đơn từ {dotted_vnd(minimum)}",
            )
        )
        channels.append(Capability.PROMOTION)
        offer = Offer(percent=percent, code=code, min_order_vnd=minimum, days=days)
        out |= {"percent": percent, "min_order_vnd": minimum, "code": code}
    message = str(params.get("message") or default_message(items, offer))
    if "post" in levers:
        body: Params = {
            "ref": f"p-{ref[3:]}"[:64],
            "campaign_ref": ref,
            "message": message,
            "link_path": _link_path(items),
        }
        if items:
            body["sku"] = items[0].sku
        if params.get("scheduled_at"):
            body["scheduled_at"] = params["scheduled_at"]
        parts.append(estimate_post(order_vnd, margin, facts.priors))
        actions.append(ActionDraft(type="create_post", body=body, description="Đăng bài trên Fanpage"))
        channels.append(Capability.FACEBOOK_POST)
        out["message"] = message
    ad_budget = 0
    if "ads" in levers:
        if params.get("platform"):
            platforms = {str(params["platform"]): _ad_budget(snapshot, days, params.get("daily_budget_vnd"))}
        elif opportunity.kind == "weekly_plan":  # the week's budget split across platforms
            total = _ad_budget(snapshot, days, params.get("daily_budget_vnd")) * days
            shares = allocate(total, enabled_platforms(snapshot), facts.priors, has_video=_video(snapshot) is not None)
            platforms = {p: _floor_to(s / days, BUDGET_STEP_VND) for p, s in shares.items()}
            platforms = {p: d for p, d in platforms.items() if d >= MIN_AD_DAILY_VND}
        else:
            platforms = {
                _default_platform(opportunity, facts): _ad_budget(snapshot, days, params.get("daily_budget_vnd"))
            }
        if not platforms:
            raise OptionNotApplicable("not enough ad budget left this month")
        creates, activations = [], []
        for platform, daily in platforms.items():
            if platform not in PLATFORMS:
                raise ValueError(f"platform must be one of {', '.join(PLATFORMS)}")
            if platform not in enabled_platforms(snapshot):
                raise OptionNotApplicable(f"{platform} ads are switched off")
            ad_ref = f"a-{ref[3:]}-{platform}"[:64]
            body = {
                "ref": ad_ref,
                "campaign_ref": ref,
                "platform": platform,
                "daily_budget_vnd": daily,
                "duration_days": days,
                "link_path": _link_path(items),
                **_ad_copy(platform, items, message, params),
            }
            if platform == "tiktok":
                video = _video(snapshot)
                if video is None:
                    raise OptionNotApplicable("TikTok needs a staff-uploaded video")
                body["asset_id"] = video
            elif items:
                body["sku"] = items[0].sku
            parts.append(estimate_ads(platform, daily, days, margin, facts.priors))
            creates.append(ActionDraft(type="create_ad", body=body, description=f"Tạo quảng cáo {platform} {ad_ref}"))
            activations.append(
                ActionDraft(
                    type="activate_ad",
                    body={},
                    path_params={"ref": ad_ref},
                    capability_hint=AD_CAPABILITY[platform],
                    description=f"Bật quảng cáo {ad_ref}",
                )
            )
            channels.append(AD_CAPABILITY[platform])
            ad_budget += daily * days
        actions += creates + activations
        out |= {"platforms": platforms}

    objective = (
        ("clearance" if opportunity.kind == "overstock" else "sales")
        if {"discount", "coupon"} & set(levers)
        else ("traffic" if "ads" in levers else "awareness")
    )
    campaign = ActionDraft(
        type="create_campaign",
        body={
            "ref": ref,
            "name": f"{strategy_title(strategy)}: {opportunity.title}"[:255],
            "objective": objective,
            "channels": list(dict.fromkeys(channels)),
            "thread_id": thread_id[:64],
            "duration_days": days,
            **({"budget_vnd": ad_budget} if ad_budget else {}),
        },
        description=f"Chiến dịch {ref}",
    )
    return OptionPlan(strategy, out, combine(strategy, parts), (campaign, *actions))


def _live_ad(opportunity: Opportunity, snapshot: GrowthSnapshot) -> Any:
    ref = str(opportunity.evidence.get("ad_ref", ""))
    ad = next((a for a in snapshot.ads if a.ref == ref and a.status == "active"), None)
    if ad is None:
        raise OptionNotApplicable(f"ad {ref or '?'} is not running")
    return ad


def _plan_scale(params: Params, opportunity: Opportunity, facts: GrowthFacts) -> OptionPlan[GrowthEstimate]:
    snapshot = facts.snapshot
    ad = _live_ad(opportunity, snapshot)
    ceiling = snapshot.settings.caps.per_day_vnd
    wanted = params.get("daily_budget_vnd") or _floor_to(ad.daily_budget_vnd * SCALE_FACTOR, BUDGET_STEP_VND)
    daily = min(int(wanted), ceiling)
    if daily <= ad.daily_budget_vnd:
        raise OptionNotApplicable(f"ad {ad.ref} is already at the per-day cap")
    days = max((ad.ends_at.date() - snapshot.today).days, 1) if ad.ends_at else DEFAULT_DAYS
    priors = facts.priors
    observed = opportunity.evidence.get("roas")
    if isinstance(observed, int | float) and observed > 0:  # the ad's own ROAS (the detector's reason to scale)
        roas = float(observed)
        prior = Prior(mean=roas, low=roas * SCALE_ROAS_LOW, high=roas, n0=1)
        priors = priors.with_values({f"ads.{ad.platform}": prior})
    estimate = estimate_ads(ad.platform, daily - ad.daily_budget_vnd, days, gross_margin_ratio(snapshot), priors)
    action = ActionDraft(
        type="set_ad_budget",
        body={"daily_budget_vnd": daily},
        path_params={"ref": ad.ref},
        capability_hint=AD_CAPABILITY[ad.platform],
        description=f"Tăng ngân sách ngày của {ad.ref} lên {dotted_vnd(daily)}",
    )
    return OptionPlan(SCALE_BUDGET, {"daily_budget_vnd": daily}, combine(SCALE_BUDGET, [estimate]), (action,))


def _plan_bidding(opportunity: Opportunity, facts: GrowthFacts) -> OptionPlan[GrowthEstimate]:
    """Optimising for purchases instead of clicks: the rest of the flight earns `ads.conversion_bidding_uplift` more."""
    snapshot = facts.snapshot
    ad = _live_ad(opportunity, snapshot)
    days = max((ad.ends_at.date() - snapshot.today).days, 1) if ad.ends_at else DEFAULT_DAYS
    roas, uplift = facts.priors.get(f"ads.{ad.platform}"), facts.priors.get("ads.conversion_bidding_uplift")
    margin = gross_margin_ratio(snapshot)
    spend = ad.daily_budget_vnd * days

    def at(u: float) -> tuple[int, int]:
        revenue = spend * roas.mean * u
        return round(revenue), round(revenue * margin)

    low, mid, high = at(uplift.low), at(uplift.mean), at(uplift.high)
    estimate = GrowthEstimate(
        SWITCH_BIDDING,
        *(low[0], mid[0], high[0], low[1], mid[1], high[1]),
        confidence=confidence_of(uplift),
        assumptions=(f"ROAS +{uplift.mean:.0%} when optimising for purchases (prior)",),
    )
    action = ActionDraft(
        type="set_ad_optimization",
        body={"objective": "conversions"},
        path_params={"ref": ad.ref},
        capability_hint=AD_CAPABILITY[ad.platform],
        description=f"Chuyển {ad.ref} sang tối ưu theo đơn hàng",
    )
    return OptionPlan(SWITCH_BIDDING, {"objective": "conversions"}, estimate, (action,))


NOTHING_ESTIMATE = GrowthEstimate(DO_NOTHING, 0, 0, 0, 0, 0, 0, confidence=0.9, assumptions=("Giữ nguyên hiện trạng",))


def plan_growth(
    option_id: str, strategy: str, params: Params | None, opportunity: Opportunity, facts: GrowthFacts
) -> OptionPlan[GrowthEstimate]:
    """Rebuild one option from its strategy and parameters. Raises OptionNotApplicable or ValueError."""
    params = {k: v for k, v in (params or {}).items() if v is not None}
    if strategy == DO_NOTHING:
        return OptionPlan(DO_NOTHING, {}, NOTHING_ESTIMATE, ())
    if strategy not in strategies_for(opportunity.kind):
        raise ValueError(f"strategy {strategy!r} does not apply to {opportunity.kind!r}")
    if strategy == SCALE_BUDGET:
        return _plan_scale(params, opportunity, facts)
    if strategy == SWITCH_BIDDING:
        return _plan_bidding(opportunity, facts)
    return _plan_campaign(option_id, strategy, params, opportunity, facts)


def growth_menu(opportunity: Opportunity, facts: GrowthFacts) -> list[OptionPlan[GrowthEstimate]]:
    """Every applicable strategy with its default parameters (and "do nothing"), only those whose actions the web's
    rules accept now (margin floor, legal maximum, caps): the planner is never offered what could not run."""
    state = state_from_snapshot(facts.snapshot)
    plans = []
    for strategy in (*strategies_for(opportunity.kind), DO_NOTHING):
        option_id = strategy.replace("+", "-")
        try:
            plan = plan_growth(option_id, strategy, None, opportunity, facts)
        except (OptionNotApplicable, ValueError):
            continue
        specs = [
            to_spec(d, action_id=f"{option_id}-{n}", idempotency_key=f"menu:{n}") for n, d in enumerate(plan.actions, 1)
        ]
        if not check_option(specs, state, auto=False).problems:
            plans.append(plan)
    return plans


def opportunity_value(opportunity: Opportunity, facts: GrowthFacts) -> float:
    """The prioritizer's score: the best default option's confidence-weighted expected profit."""
    values = [p.estimate.value for p in growth_menu(opportunity, facts) if isinstance(p.estimate, GrowthEstimate)]
    return max(values, default=0.0)


# ------------------------------------------------------------------------------------------------ tier, brand


def measured_platforms(snapshot: GrowthSnapshot) -> frozenset[str]:
    """Platforms with at least one measured ad outcome (a platform's first campaign is always high)."""
    return frozenset(o.capability.removeprefix("ads_") for o in snapshot.outcomes if o.capability.startswith("ads_"))


def growth_tier(actions: Sequence[ActionDraft | ActionSpec], snapshot: GrowthSnapshot) -> RiskTier:
    measured = measured_platforms(snapshot)
    return max_tier([action_tier(a, measured) for a in actions]) if actions else RiskTier.LOW


def copy_texts(actions: Sequence[ActionDraft | ActionSpec]) -> list[tuple[TextKind, str]]:
    """Every text an option would publish, with its kind (for the lint and the brand judge)."""
    texts: list[tuple[TextKind, str]] = []
    for action in actions:
        body = action.body
        if action.type == "create_post":
            texts.append(("post", str(body["message"])))
        elif action.type == "create_coupon":
            texts.append(("coupon_title", str(body["title"])))
        elif action.type == "create_ad":
            for name, kind in (("headline", "headline"), ("primary_text", "primary_text"), ("ad_text", "ad_text")):
                if body.get(name):
                    texts.append((kind, str(body[name])))  # type: ignore[arg-type]
            texts += [("google_headline", str(h)) for h in body.get("headlines") or []]
            texts += [("google_description", str(d)) for d in body.get("descriptions") or []]
    return texts


def copy_problems(
    actions: Sequence[ActionDraft | ActionSpec], snapshot: GrowthSnapshot, policy: BrandPolicy
) -> list[str]:
    """The deterministic brand lint over every text of an option: numbers must be the executed ones."""
    percents: list[float] = []
    amounts: list[int] = []
    skus: set[str] = set()
    for action in actions:
        body = action.body
        if action.type in ("apply_discount", "create_coupon"):
            percents.append(float(body["percent"]))
        if body.get("min_order_vnd"):
            amounts.append(int(body["min_order_vnd"]))
        skus |= set(body.get("skus") or []) | ({str(body["sku"])} if body.get("sku") else set())
    for sku in skus:
        item = snapshot.item(sku)
        if item is not None:
            amounts.append(item.price_vnd)
            amounts += [round(item.price_vnd * (1 - p / 100)) for p in percents]
    competitors = sorted(
        {p.competitor for p in snapshot.competitor_prices} | {c.competitor for c in snapshot.competitor_campaigns}
    )
    return [
        f"{kind}: {problem}"
        for kind, text in copy_texts(actions)
        for problem in lint_copy(text, kind, policy, percents=percents, amounts_vnd=amounts, competitors=competitors)
    ]
