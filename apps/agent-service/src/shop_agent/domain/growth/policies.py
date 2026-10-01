"""The shop's rules for the agent's writes, exactly as the web Agent API enforces them (docs/GROWTH_AGENT.md section 4).

`evaluate` answers what the web answers for one request over a snapshot of the shop (`ShopState`): 200, or the
status, error `code` and `reason` of the first rule the request breaks. The web implements the same function in
TypeScript (apps/web-ecommerce `AgentLimits.ts`); packages/contracts/test-vectors/limits/ pins both, and FakeShop uses
this one, so a simulated shop refuses exactly what the real one refuses.

Order (packages/contracts/openapi/web-agent-api.yaml): the body (400), the kill switch and the approval (403), the
references (404), then the limits: 409 when the shop's current state is in the way, 422 when the request itself breaks
a limit. Protective requests (end a promotion, pause an ad, lower a budget) skip the kill switch and the approval.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from shop_agent.domain.actions import (
    ACTIONS,
    AD_CAPABILITY,
    ActionDef,
    ActionSpec,
    AdBody,
    AdBudgetBody,
    CampaignBody,
    ChannelSwitchBody,
    CouponBody,
    DiscountBody,
    InventoryAdjustmentBody,
    PostBody,
)
from shop_agent.domain.capabilities import Capability, WriteClass
from shop_agent.domain.growth.settings import GrowthSettings
from shop_agent.domain.growth.snapshot import GrowthSnapshot, vn_date
from shop_agent.domain.policies.autonomy import AutonomyMode

POLICY_VERSION = "2026-09-30"

LEGAL_MAX_COMBINED = 0.5  # Decree 81/2018 as amended by 128/2024: at most 50% below the price before the promotion
NEW_ARRIVAL_DAYS = 30
PROMO_FREQUENCY_DAYS = 30  # one agent discount per SKU per 30 days
DEAD_STOCK_DAYS = 180  # dead stock may go down to cost, with an approval grant
MAX_AGENT_PROMOTIONS = 3
POSTS_PER_DAY = 2
POST_SPACING = timedelta(hours=4)
SCHEDULE_MIN = timedelta(minutes=10)
SCHEDULE_MAX = timedelta(days=30)

# The web's low-tier caps: without a grant, a request runs only when its capabilities are in `auto_low` and it is
# inside these (docs/GROWTH_AGENT.md section 4, "Low tier").
LOW_DISCOUNT_PCT = 15.0
LOW_DISCOUNT_DAYS = 7
LOW_SKU_COUNT = 20
LOW_COUPON_PCT = 15
LOW_COUPON_DAYS = 7
LOW_CAMPAIGN_BUDGET_VND = 1_500_000
LOW_AD_DAILY_VND = 300_000
LOW_AD_TOTAL_VND = 1_500_000
LOW_AD_DAYS = 5

# A number followed by a percent or money unit ("20%", "199.000đ", "199k", "1,2 triệu"): a post that says one is not
# an organic post any more and needs a person. Deliberately broad ("2kg" matches): it only decides who approves.
PRICE_CLAIM = re.compile(r"\d\s*(?:%|phần trăm|₫|vnđ|vnd|đ|k|nghìn|ngàn|triệu|tr)", re.IGNORECASE)
_EPSILON = 1e-9

Status = Literal[200, 400, 403, 404, 409, 422]
Approval = Literal["grant", "auto_low", "protective", "ingestion"]


class _State(BaseModel):
    model_config = ConfigDict(frozen=True)


class ProductState(_State):
    sku: str
    category: str
    price_vnd: int
    cost_vnd: int
    created_at: datetime
    last_received_at: datetime | None = None


class DiscountState(_State):
    sku: str
    percent: float
    source: Literal["admin", "agent"]
    action: str  # the action (or admin record) that created it
    starts_at: datetime
    ends_at: datetime
    revoked: bool = False
    campaign_ref: str | None = None


class CouponState(_State):
    code: str
    percent: float
    source: Literal["admin", "agent"]
    usable: bool  # active, started, not expired, not used up
    campaign_ref: str | None = None


class CampaignState(_State):
    ref: str
    budget_vnd: int
    status: str  # draft | active | paused | ended | reverted


class AdState(_State):
    ref: str
    campaign_ref: str | None
    platform: Literal["meta", "google", "tiktok"]
    status: str  # paused | active | ended | reverted
    daily_budget_vnd: int
    total_budget_vnd: int
    ends_at: datetime


class PostState(_State):
    ref: str
    at: datetime  # published or scheduled


class AssetState(_State):
    id: int
    kind: Literal["image", "video"]


class BudgetState(_State):
    cap_vnd: int
    reserved_vnd: int = 0
    spent_vnd: int = 0

    @property
    def remaining_vnd(self) -> int:
        return self.cap_vnd - max(self.reserved_vnd, self.spent_vnd)


class ShopState(_State):
    """What the rules read: the web loads it from its tables, FakeShop from memory, the vectors from JSON."""

    now: datetime
    settings: GrowthSettings = Field(default_factory=GrowthSettings)
    products: tuple[ProductState, ...] = ()
    discounts: tuple[DiscountState, ...] = ()
    coupons: tuple[CouponState, ...] = ()
    campaigns: tuple[CampaignState, ...] = ()
    ads: tuple[AdState, ...] = ()
    posts: tuple[PostState, ...] = ()
    assets: tuple[AssetState, ...] = ()
    budget: BudgetState = BudgetState(cap_vnd=0)
    measured_platforms: frozenset[str] = frozenset()  # platforms with at least one measured campaign

    def product(self, sku: str) -> ProductState | None:
        return next((p for p in self.products if p.sku == sku), None)

    def ad(self, ref: str) -> AdState | None:
        return next((a for a in self.ads if a.ref == ref), None)

    def campaign(self, ref: str) -> CampaignState | None:
        return next((c for c in self.campaigns if c.ref == ref), None)

    def asset(self, asset_id: int) -> AssetState | None:
        return next((a for a in self.assets if a.id == asset_id), None)

    def running_discounts(self) -> list[DiscountState]:
        return [d for d in self.discounts if not d.revoked and d.starts_at <= self.now < d.ends_at]


@dataclass(frozen=True)
class Verdict:
    status: Status
    code: str | None = None
    reason: str | None = None
    detail: str = ""
    write_class: WriteClass = WriteClass.SHOP_CHANGE
    capabilities: tuple[Capability, ...] = ()
    approval: Approval | None = None
    replaces: tuple[str, ...] = ()  # discount actions a `replace_existing` discount ends

    @property
    def ok(self) -> bool:
        return self.status == 200


ROUTES: dict[str, ActionDef] = {definition.endpoint: definition for definition in ACTIONS.values()}


def _refuse(status: Status, code: str, detail: str, reason: str | None = None) -> Verdict:
    return Verdict(status, code, reason, detail)


def campaign_kind(channels: Sequence[str]) -> str:
    """How the web files a campaign: promotion, content (posts), ads, or mixed."""
    kinds = {"promotion" if c == "promotion" else "content" if c == "facebook_post" else "ads" for c in channels}
    return kinds.pop() if len(kinds) == 1 else "mixed"


def mentions_price(text: str) -> bool:
    return PRICE_CLAIM.search(text) is not None


def combined_reduction(*percents: float) -> float:
    """1 - (1 - a)(1 - b)...: the share of the list price that stacked promotions take off."""
    remaining = 1.0
    for percent in percents:
        remaining *= 1 - percent / 100
    return 1 - remaining


def _days_until(start: datetime, end: datetime) -> int:
    return max(1, math.ceil((end - start).total_seconds() / 86_400))


def _start(starts_at: datetime | None, now: datetime) -> datetime:
    """A start in the past (a late approval) or no start means now: the approved body never has to change."""
    return starts_at if starts_at is not None and starts_at > now else now


# ------------------------------------------------------------------------------------------------ approval


def _mode_problem(capabilities: Sequence[Capability], settings: GrowthSettings) -> str | None:
    modes = {settings.autonomy.get(c, AutonomyMode.ASK) for c in capabilities}
    for mode in (AutonomyMode.OFF, AutonomyMode.SHADOW, AutonomyMode.ASK):
        if mode in modes:
            return mode.value
    return None


def within_low_caps(route: str, body: BaseModel, state: ShopState, ad: AdState | None) -> bool:
    """Is this request inside the web's low-tier caps (so `auto_low` may run it without a grant)?"""
    if isinstance(body, DiscountBody):
        return (
            body.skus is not None
            and len(body.skus) <= LOW_SKU_COUNT
            and body.percent <= LOW_DISCOUNT_PCT
            and body.duration_days <= LOW_DISCOUNT_DAYS
        )
    if isinstance(body, CouponBody):
        return body.percent <= LOW_COUPON_PCT and body.duration_days <= LOW_COUPON_DAYS
    if isinstance(body, CampaignBody):
        return (body.budget_vnd or 0) <= LOW_CAMPAIGN_BUDGET_VND
    if isinstance(body, PostBody):
        return not mentions_price(body.message)
    if isinstance(body, AdBody):
        return _low_ad(body.platform, body.daily_budget_vnd, body.total_budget_vnd, body.duration_days, state)
    if isinstance(body, ChannelSwitchBody):
        return len(body.skus) <= LOW_SKU_COUNT
    if route == "marketing/ads/{ref}/activate" and ad is not None:
        days = math.ceil(ad.total_budget_vnd / ad.daily_budget_vnd)
        return _low_ad(ad.platform, ad.daily_budget_vnd, ad.total_budget_vnd, days, state)
    if isinstance(body, AdBudgetBody) and ad is not None:
        total = ad.total_budget_vnd + _extra_reservation(ad, body.daily_budget_vnd, state.now)
        return _low_ad(ad.platform, body.daily_budget_vnd, total, 0, state)
    # A change of bidding is medium risk (always a person); inventory adjustments, tasks and checklists are low.
    return route != "marketing/ads/{ref}/optimization"


def _low_ad(platform: str, daily: int, total: int, days: int, state: ShopState) -> bool:
    return (
        daily <= LOW_AD_DAILY_VND
        and total <= LOW_AD_TOTAL_VND
        and days <= LOW_AD_DAYS
        and platform in state.measured_platforms  # a platform's first campaign is always a person's call
    )


# ------------------------------------------------------------------------------------------------ evaluate


def evaluate(
    route: str, path_params: Mapping[str, str], body: Mapping[str, Any], state: ShopState, *, has_grant: bool
) -> Verdict:
    """What the web answers for this request (see the module docstring). `has_grant`: a verified grant covers it."""
    definition = ROUTES.get(route)
    if definition is None:
        return _refuse(404, "not_found", f"unknown endpoint {route}")
    try:
        model = definition.body_model.model_validate(dict(body))
    except ValidationError as exc:
        return _refuse(400, "invalid_request", "; ".join(e["msg"] for e in exc.errors()))

    ad: AdState | None = None
    if route.startswith("marketing/ads/{ref}"):
        ad = state.ad(path_params.get("ref", ""))
        if ad is None:
            return _refuse(404, "not_found", f"no ad {path_params.get('ref')}")
    write_class = definition.write_class
    if isinstance(model, AdBudgetBody) and ad is not None and model.daily_budget_vnd <= ad.daily_budget_vnd:
        write_class = WriteClass.PROTECTIVE  # lowering a budget
    capabilities = _capabilities(definition, model, ad)

    approval: Approval
    if write_class is WriteClass.SHOP_CHANGE:
        if not state.settings.growth_enabled:
            return _refuse(403, "agent_disabled", "the owner switched the agent off (growth.enabled)")
        if has_grant:
            approval = "grant"
        else:
            mode = _mode_problem(capabilities, state.settings)
            if mode is not None:
                return _refuse(403, "approval_required", f"no approval grant and a capability is in {mode}", mode)
            if not within_low_caps(route, model, state, ad):
                return _refuse(
                    403, "approval_required", "no approval grant and above the low-risk caps", "above_low_caps"
                )
            approval = "auto_low"
    else:
        approval = "protective"

    verdict = _check(route, path_params, model, state, ad, has_grant=has_grant)
    if not verdict.ok:
        return verdict
    return Verdict(
        200,
        detail=verdict.detail,
        write_class=write_class,
        capabilities=capabilities,
        approval=approval,
        replaces=verdict.replaces,
    )


def _capabilities(definition: ActionDef, model: BaseModel, ad: AdState | None) -> tuple[Capability, ...]:
    if isinstance(model, AdBody):
        return (AD_CAPABILITY[model.platform],)
    if isinstance(model, CampaignBody):
        return tuple(model.channels)
    if ad is not None:
        return (AD_CAPABILITY[ad.platform],)
    return (definition.capability,) if definition.capability is not None else ()


def _check(
    route: str,
    path_params: Mapping[str, str],
    model: BaseModel,
    state: ShopState,
    ad: AdState | None,
    *,
    has_grant: bool,
) -> Verdict:
    if isinstance(model, DiscountBody):
        return _check_discount(model, state, has_grant=has_grant)
    if isinstance(model, CouponBody):
        return _check_coupon(model, state, has_grant=has_grant)
    if isinstance(model, CampaignBody):
        return _check_campaign(model, state)
    if isinstance(model, PostBody):
        return _check_post(model, state)
    if isinstance(model, AdBody):
        return _check_ad(model, state)
    if route == "promotions/{ref}/end":
        return _check_end(path_params.get("ref", ""), state)
    if ad is not None:
        return _check_existing_ad(route, model, ad, state)
    skus: list[str] = []
    if isinstance(model, ChannelSwitchBody):
        skus = model.skus
    elif isinstance(model, InventoryAdjustmentBody):
        skus = [model.sku]
    missing = [s for s in skus if state.product(s) is None]
    if missing:
        return _refuse(404, "not_found", f"unknown SKU(s): {', '.join(missing)}")
    return Verdict(200)


# ------------------------------------------------------------------------------------------------ promotions


def _targets(body: DiscountBody, state: ShopState) -> list[ProductState] | Verdict:
    if body.category is not None:
        products = [p for p in state.products if p.category == body.category]
        return products or _refuse(404, "not_found", f"no product in category {body.category}")
    missing = [s for s in body.skus or [] if state.product(s) is None]
    if missing:
        return _refuse(404, "not_found", f"unknown SKU(s): {', '.join(missing)}")
    return [p for p in (state.product(s) for s in body.skus or []) if p is not None]


def _running_agent_promotions(state: ShopState, excluding: set[str]) -> int:
    discount_actions = {
        d.action for d in state.running_discounts() if d.source == "agent" and d.action not in excluding
    }
    coupons = [c for c in state.coupons if c.source == "agent" and c.usable]
    return len(discount_actions) + len(coupons)


def _margin_problem(
    products: Sequence[ProductState], percents: Mapping[str, Sequence[float]], state: ShopState, *, has_grant: bool
) -> Verdict | None:
    """Every product keeps the margin floor after the agent's stacked promotions, and never sells below cost."""
    floor = state.settings.goal.margin_floor_pct / 100
    dead_before = state.now - timedelta(days=DEAD_STOCK_DAYS)
    for product in products:
        price = product.price_vnd * (1 - combined_reduction(*percents.get(product.sku, ())))
        if price < product.cost_vnd - _EPSILON:
            return _refuse(422, "limit_exceeded", f"{product.sku} would sell below cost", "below_cost")
        margin = (price - product.cost_vnd) / price if price > 0 else -1.0
        dead_stock = product.last_received_at is not None and product.last_received_at <= dead_before
        if margin < floor - _EPSILON and not (has_grant and dead_stock):
            return _refuse(
                422,
                "limit_exceeded",
                f"{product.sku}: gross margin {margin * 100:.1f}% is below the floor of {floor * 100:g}%",
                "margin_floor",
            )
    return None


def _check_discount(body: DiscountBody, state: ShopState, *, has_grant: bool) -> Verdict:
    targets = _targets(body, state)
    if isinstance(targets, Verdict):
        return targets
    start = _start(body.starts_at, state.now)
    end = start + timedelta(days=body.duration_days)
    new_before = state.now - timedelta(days=NEW_ARRIVAL_DAYS)
    fresh = [p.sku for p in targets if p.created_at > new_before]
    if fresh:
        return _refuse(422, "limit_exceeded", f"new arrivals are not discounted: {', '.join(fresh)}", "new_arrival")

    skus = {p.sku for p in targets}
    overlapping = [
        d for d in state.discounts if d.sku in skus and not d.revoked and d.ends_at > start and d.starts_at < end
    ]
    if overlapping and not (body.replace_existing and all(d.source == "agent" for d in overlapping)):
        taken = sorted({d.sku for d in overlapping})
        return _refuse(409, "overlap", f"already discounted: {', '.join(taken)}", "discount_overlap")
    replaced = {d.action for d in overlapping}

    recent = state.now - timedelta(days=PROMO_FREQUENCY_DAYS)
    repeated = sorted(
        {
            d.sku
            for d in state.discounts
            if d.sku in skus and d.source == "agent" and d.action not in replaced and recent < d.starts_at <= state.now
        }
    )
    if repeated:
        return _refuse(
            422, "limit_exceeded", f"discounted by the agent in the last 30 days: {', '.join(repeated)}", "frequency"
        )
    if _running_agent_promotions(state, replaced) >= MAX_AGENT_PROMOTIONS:
        return _refuse(422, "limit_exceeded", f"{MAX_AGENT_PROMOTIONS} agent promotions already run", "max_promotions")

    usable = [c for c in state.coupons if c.usable]
    largest_coupon = max((c.percent for c in usable), default=0.0)
    if combined_reduction(body.percent, largest_coupon) > LEGAL_MAX_COMBINED + _EPSILON:
        return _refuse(
            422,
            "limit_exceeded",
            f"{body.percent:g}% with the {largest_coupon:g}% coupon takes more than 50% off the list price",
            "legal_max",
        )
    agent_coupon = max((c.percent for c in usable if c.source == "agent"), default=0.0)
    stacked = {p.sku: (body.percent, agent_coupon) for p in targets}
    problem = _margin_problem(targets, stacked, state, has_grant=has_grant)
    if problem is not None:
        return problem
    detail = f"{body.percent:g}% off {len(targets)} product(s) for {body.duration_days} day(s)"
    return Verdict(200, detail=detail, replaces=tuple(sorted(replaced)))


def _check_coupon(body: CouponBody, state: ShopState, *, has_grant: bool) -> Verdict:
    if any(c.code == body.code for c in state.coupons):
        return _refuse(409, "overlap", f"coupon {body.code} exists", "ref_taken")
    if _running_agent_promotions(state, set()) >= MAX_AGENT_PROMOTIONS:
        return _refuse(422, "limit_exceeded", f"{MAX_AGENT_PROMOTIONS} agent promotions already run", "max_promotions")
    running = state.running_discounts()
    largest_discount = max((d.percent for d in running), default=0.0)
    if combined_reduction(largest_discount, body.percent) > LEGAL_MAX_COMBINED + _EPSILON:
        return _refuse(
            422,
            "limit_exceeded",
            f"{body.percent}% with the {largest_discount:g}% discount takes more than 50% off the list price",
            "legal_max",
        )
    agent_discount: dict[str, float] = {}
    for discount in running:
        if discount.source == "agent":
            agent_discount[discount.sku] = max(agent_discount.get(discount.sku, 0.0), discount.percent)
    stacked = {p.sku: (agent_discount.get(p.sku, 0.0), float(body.percent)) for p in state.products}
    problem = _margin_problem(state.products, stacked, state, has_grant=has_grant)
    if problem is not None:
        return problem
    return Verdict(200, detail=f"coupon {body.code}: {body.percent}% for {body.duration_days} day(s)")


def _check_end(ref: str, state: ShopState) -> Verdict:
    coupon = next((c for c in state.coupons if c.code == ref and c.source == "agent"), None)
    campaign = state.campaign(ref)
    if coupon is None and campaign is None:
        return _refuse(404, "not_found", f"no agent coupon or campaign {ref}")
    return Verdict(200, detail=f"ended the agent's promotions of {ref}")


# ------------------------------------------------------------------------------------------------ marketing


def _check_campaign(body: CampaignBody, state: ShopState) -> Verdict:
    if state.campaign(body.ref) is not None:
        return _refuse(409, "overlap", f"campaign {body.ref} exists", "ref_taken")
    cap = state.settings.caps.per_campaign_vnd
    if (body.budget_vnd or 0) > cap:
        return _refuse(422, "limit_exceeded", f"budget above the per-campaign cap of {cap} VND", "per_campaign_cap")
    return Verdict(200, detail=f"campaign {body.ref}")


def _image_problem(sku: str | None, asset_id: int | None, state: ShopState, kind: str) -> Verdict | None:
    if sku is not None and state.product(sku) is None:
        return _refuse(404, "not_found", f"unknown SKU {sku}")
    if asset_id is not None:
        asset = state.asset(asset_id)
        if asset is None:
            return _refuse(404, "not_found", f"no marketing asset {asset_id}")
        if asset.kind != kind:
            reason = "video_required" if kind == "video" else "asset_kind"
            return _refuse(422, "limit_exceeded", f"asset {asset_id} is a {asset.kind}, not a {kind}", reason)
    return None


def _check_post(body: PostBody, state: ShopState) -> Verdict:
    if any(p.ref == body.ref for p in state.posts):
        return _refuse(409, "overlap", f"post {body.ref} exists", "ref_taken")
    if body.campaign_ref is not None and state.campaign(body.campaign_ref) is None:
        return _refuse(404, "not_found", f"no campaign {body.campaign_ref}")
    problem = _image_problem(body.sku, body.asset_id, state, "image")
    if problem is not None:
        return problem
    at = state.now
    if body.scheduled_at is not None and body.scheduled_at >= state.now + SCHEDULE_MIN:
        if body.scheduled_at > state.now + SCHEDULE_MAX:
            return _refuse(422, "limit_exceeded", "a post is scheduled at most 30 days ahead", "schedule")
        at = body.scheduled_at
    same_day = [p for p in state.posts if vn_date(p.at) == vn_date(at)]
    if len(same_day) >= POSTS_PER_DAY:
        return _refuse(422, "limit_exceeded", f"already {POSTS_PER_DAY} posts that day", "frequency")
    if any(abs(p.at - at) < POST_SPACING for p in state.posts):
        return _refuse(422, "limit_exceeded", "posts are at least 4 hours apart", "frequency")
    return Verdict(200, detail=f"post {body.ref} at {at.isoformat()}")


def _campaign_room(campaign: CampaignState, state: ShopState, excluding: str | None = None) -> int:
    cap = min(campaign.budget_vnd, state.settings.caps.per_campaign_vnd)
    committed = sum(
        a.total_budget_vnd
        for a in state.ads
        if a.campaign_ref == campaign.ref and a.status != "reverted" and a.ref != excluding
    )
    return cap - committed


def _check_ad(body: AdBody, state: ShopState) -> Verdict:
    if state.ad(body.ref) is not None:
        return _refuse(409, "overlap", f"ad {body.ref} exists", "ref_taken")
    campaign = state.campaign(body.campaign_ref)
    if campaign is None or campaign.status not in ("draft", "active"):
        return _refuse(404, "not_found", f"no open campaign {body.campaign_ref}")
    problem = _image_problem(body.sku, body.asset_id, state, "video" if body.platform == "tiktok" else "image")
    if problem is not None:
        return problem
    per_day = state.settings.caps.per_day_vnd
    if body.daily_budget_vnd > per_day:
        return _refuse(422, "limit_exceeded", f"daily budget above the per-day cap of {per_day} VND", "per_day_cap")
    if body.total_budget_vnd > _campaign_room(campaign, state):
        return _refuse(
            422,
            "limit_exceeded",
            "the campaign's ads would exceed its budget or the per-campaign cap",
            "per_campaign_cap",
        )
    if body.total_budget_vnd > state.budget.remaining_vnd:
        return _refuse(
            409, "budget_exceeded", f"{state.budget.remaining_vnd} VND left in this month's ad budget", "monthly_cap"
        )
    return Verdict(200, detail=f"{body.platform} ad {body.ref}, {body.total_budget_vnd} VND reserved")


def _extra_reservation(ad: AdState, daily: int, now: datetime) -> int:
    """What raising the daily budget adds to the reservation: the difference for the days left."""
    return max(0, daily - ad.daily_budget_vnd) * _days_until(now, ad.ends_at)


def _check_existing_ad(route: str, model: BaseModel, ad: AdState, state: ShopState) -> Verdict:
    closed = ad.status in ("ended", "reverted") or ad.ends_at <= state.now
    if route == "marketing/ads/{ref}/pause":
        return Verdict(200, detail=f"ad {ad.ref} paused")
    if isinstance(model, AdBudgetBody):
        if model.daily_budget_vnd <= ad.daily_budget_vnd:
            return Verdict(200, detail=f"ad {ad.ref} daily budget {model.daily_budget_vnd} VND")
        if closed:
            return _refuse(422, "limit_exceeded", f"ad {ad.ref} has ended", "ad_closed")
        per_day = state.settings.caps.per_day_vnd
        if model.daily_budget_vnd > per_day:
            return _refuse(422, "limit_exceeded", f"daily budget above the per-day cap of {per_day} VND", "per_day_cap")
        extra = _extra_reservation(ad, model.daily_budget_vnd, state.now)
        campaign = state.campaign(ad.campaign_ref) if ad.campaign_ref else None
        if campaign is not None and ad.total_budget_vnd + extra > _campaign_room(campaign, state, excluding=ad.ref):
            return _refuse(
                422,
                "limit_exceeded",
                "the campaign's ads would exceed its budget or the per-campaign cap",
                "per_campaign_cap",
            )
        if extra > state.budget.remaining_vnd:
            return _refuse(
                409,
                "budget_exceeded",
                f"{state.budget.remaining_vnd} VND left in this month's ad budget",
                "monthly_cap",
            )
        return Verdict(200, detail=f"ad {ad.ref} daily budget {model.daily_budget_vnd} VND (+{extra} VND reserved)")
    if closed:
        return _refuse(422, "limit_exceeded", f"ad {ad.ref} has ended", "ad_closed")
    return Verdict(200, detail=f"ad {ad.ref}")


# ------------------------------------------------------------------------------------------------ an option's actions


def state_from_snapshot(snapshot: GrowthSnapshot) -> ShopState:
    """The rules' view of the shop, from the analytics views the agent reads (validate checks options against it)."""
    now = snapshot.taken_at
    period = f"{vn_date(now):%Y-%m}"
    budget = next((b for b in snapshot.budget if b.period == period), None)
    cap = budget.cap_vnd if budget else (snapshot.targets.monthly_ad_cap_vnd if snapshot.targets else 0)
    return ShopState(
        now=now,
        settings=snapshot.settings,
        products=tuple(
            ProductState(
                sku=item.sku,
                category=item.category,
                price_vnd=item.price_vnd,
                cost_vnd=item.unit_cost_vnd,
                created_at=item.created_at,
                last_received_at=item.last_received_at,
            )
            for item in snapshot.catalog
            if not item.is_archived
        ),
        discounts=tuple(
            DiscountState(
                sku=p.sku,
                percent=p.percent,
                source="agent" if p.source == "agent" else "admin",
                action=p.action_key or p.ref,
                starts_at=p.starts_at,
                ends_at=p.ends_at,
                revoked=p.revoked_at is not None,
                campaign_ref=p.campaign_ref,
            )
            for p in snapshot.promotions
            if p.kind == "discount" and p.sku is not None
        ),
        coupons=tuple(
            CouponState(
                code=p.ref,
                percent=p.percent,
                source="agent" if p.source == "agent" else "admin",
                usable=p.active,
                campaign_ref=p.campaign_ref,
            )
            for p in snapshot.promotions
            if p.kind == "coupon"
        ),
        campaigns=tuple(CampaignState(ref=c.ref, budget_vnd=c.budget_vnd, status=c.status) for c in snapshot.campaigns),
        ads=tuple(
            AdState(
                ref=a.ref,
                campaign_ref=a.campaign_ref,
                platform=a.platform,
                status=a.status,
                daily_budget_vnd=a.daily_budget_vnd,
                total_budget_vnd=a.total_budget_vnd,
                ends_at=a.ends_at or now,
            )
            for a in snapshot.ads
            if a.platform in AD_CAPABILITY
        ),
        posts=tuple(
            PostState(ref=p.ref, at=at)
            for p in snapshot.posts
            if p.status != "removed" and (at := p.published_at or p.scheduled_at) is not None
        ),
        assets=tuple(
            AssetState(id=a.asset_id, kind="video" if a.kind == "video" else "image") for a in snapshot.assets
        ),
        budget=BudgetState(
            cap_vnd=cap,
            reserved_vnd=budget.reserved_vnd if budget else 0,
            spent_vnd=budget.spent_vnd if budget else 0,
        ),
        measured_platforms=frozenset(
            o.capability.removeprefix("ads_") for o in snapshot.outcomes if o.capability.startswith("ads_")
        ),
    )


def after(state: ShopState, action: ActionSpec, verdict: Verdict) -> ShopState:
    """The state once `action` has run: what the next action of the same option is checked against."""
    body, now = action.body, state.now
    ref = action.path_params.get("ref", "")
    if action.type == "apply_discount":
        model = DiscountBody.model_validate(body)
        start = _start(model.starts_at, now)
        skus = model.skus or [p.sku for p in state.products if p.category == model.category]
        kept = tuple(
            d.model_copy(update={"revoked": True}) if d.action in verdict.replaces else d for d in state.discounts
        )
        added = tuple(
            DiscountState(
                sku=sku,
                percent=model.percent,
                source="agent",
                action=action.idempotency_key,
                starts_at=start,
                ends_at=start + timedelta(days=model.duration_days),
                campaign_ref=model.campaign_ref,
            )
            for sku in skus
        )
        return state.model_copy(update={"discounts": kept + added})
    if action.type == "create_coupon":
        coupon = CouponBody.model_validate(body)
        usable = _start(coupon.starts_at, now) <= now
        added_coupon = CouponState(
            code=coupon.code, percent=coupon.percent, source="agent", usable=usable, campaign_ref=coupon.campaign_ref
        )
        return state.model_copy(update={"coupons": (*state.coupons, added_coupon)})
    if action.type == "create_campaign":
        campaign = CampaignBody.model_validate(body)
        status = "active" if _start(campaign.starts_at, now) <= now else "draft"
        added_campaign = CampaignState(ref=campaign.ref, budget_vnd=campaign.budget_vnd or 0, status=status)
        return state.model_copy(update={"campaigns": (*state.campaigns, added_campaign)})
    if action.type == "create_post":
        post = PostBody.model_validate(body)
        at = post.scheduled_at if post.scheduled_at and post.scheduled_at >= now + SCHEDULE_MIN else now
        return state.model_copy(update={"posts": (*state.posts, PostState(ref=post.ref, at=at))})
    if action.type == "create_ad":
        ad = AdBody.model_validate(body)
        start = _start(ad.starts_at, now)
        added_ad = AdState(
            ref=ad.ref,
            campaign_ref=ad.campaign_ref,
            platform=ad.platform,
            status="paused",
            daily_budget_vnd=ad.daily_budget_vnd,
            total_budget_vnd=ad.total_budget_vnd,
            ends_at=start + timedelta(days=ad.duration_days),
        )
        budget = state.budget.model_copy(update={"reserved_vnd": state.budget.reserved_vnd + ad.total_budget_vnd})
        return state.model_copy(update={"ads": (*state.ads, added_ad), "budget": budget})
    existing = state.ad(ref)
    if existing is not None and action.type in ("activate_ad", "pause_ad", "set_ad_budget"):
        changed = existing
        budget = state.budget
        if action.type == "activate_ad":
            changed = existing.model_copy(update={"status": "active"})
        elif action.type == "pause_ad":
            changed = existing.model_copy(update={"status": "paused"})
        else:
            daily = AdBudgetBody.model_validate(body).daily_budget_vnd
            delta = (daily - existing.daily_budget_vnd) * _days_until(now, existing.ends_at)
            changed = existing.model_copy(
                update={"daily_budget_vnd": daily, "total_budget_vnd": existing.total_budget_vnd + delta}
            )
            budget = budget.model_copy(update={"reserved_vnd": max(0, budget.reserved_vnd + delta)})
        ads = tuple(changed if a.ref == ref else a for a in state.ads)
        return state.model_copy(update={"ads": ads, "budget": budget})
    if action.type == "end_promotion":
        coupons = tuple(
            c.model_copy(update={"usable": False}) if c.source == "agent" and ref in (c.code, c.campaign_ref) else c
            for c in state.coupons
        )
        discounts = tuple(
            d.model_copy(update={"revoked": True}) if d.source == "agent" and d.campaign_ref == ref else d
            for d in state.discounts
        )
        return state.model_copy(update={"coupons": coupons, "discounts": discounts})
    return state


@dataclass(frozen=True)
class OptionCheck:
    problems: tuple[str, ...]  # rules the web would refuse the option's actions for
    needs_person: bool  # without a grant the web would refuse: the option must be approved by a person


def check_option(actions: Sequence[ActionSpec], state: ShopState, *, auto: bool) -> OptionCheck:
    """Run an option's actions through the web's rules in order, each against the state the earlier ones leave.

    `auto`: the option would run without a grant. A 403 then means a person must approve (not a refusal), and the
    limits are checked again as a person-approved request.
    """
    problems: list[str] = []
    needs_person = False
    for action in actions:
        route = action.definition.endpoint
        verdict = evaluate(route, action.path_params, action.body, state, has_grant=not auto)
        if auto and verdict.code == "approval_required":
            needs_person = True
            verdict = evaluate(route, action.path_params, action.body, state, has_grant=True)
        if not verdict.ok:
            problems.append(f"{action.type}: {verdict.detail} ({verdict.reason or verdict.code})")
            continue
        state = after(state, action, verdict)
    return OptionCheck(tuple(problems), needs_person)


def before(state: ShopState, action: ActionSpec) -> ShopState:
    """The state without what this very action created: a retry (same idempotency key, which the web replays) is
    checked like its first attempt instead of being refused because of itself."""
    created = str(action.body.get("ref") or action.body.get("code") or "")
    own_ads = [a for a in state.ads if action.type == "create_ad" and a.ref == created]
    released = sum(a.total_budget_vnd for a in own_ads)
    return state.model_copy(
        update={
            "discounts": tuple(d for d in state.discounts if d.action != action.idempotency_key),
            "coupons": tuple(c for c in state.coupons if not (action.type == "create_coupon" and c.code == created)),
            "campaigns": tuple(
                c for c in state.campaigns if not (action.type == "create_campaign" and c.ref == created)
            ),
            "posts": tuple(p for p in state.posts if not (action.type == "create_post" and p.ref == created)),
            "ads": tuple(a for a in state.ads if a not in own_ads),
            "budget": state.budget.model_copy(update={"reserved_vnd": max(0, state.budget.reserved_vnd - released)}),
        }
    )
