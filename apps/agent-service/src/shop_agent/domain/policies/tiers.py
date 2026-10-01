"""Risk tiers (ADR-0011): a tier decides whether an action may run under the `auto_low` autonomy mode; everything
above `low` asks a person. The low-tier caps are the web's (`domain.growth.policies`), so an action this module calls
low is one the web accepts without a grant.

Tiers that need the shop's state (a platform's first campaign is always high) take it as an argument; Phase 7's growth
planner passes it. Without it, an ad counts as its platform's first.
"""

from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.actions import ActionDraft, ActionSpec
from shop_agent.domain.capabilities import RiskTier, WriteClass, max_tier
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.growth.policies import (
    LOW_AD_DAILY_VND,
    LOW_AD_DAYS,
    LOW_AD_TOTAL_VND,
    LOW_CAMPAIGN_BUDGET_VND,
    LOW_COUPON_DAYS,
    LOW_COUPON_PCT,
    LOW_DISCOUNT_DAYS,
    LOW_DISCOUNT_PCT,
    LOW_SKU_COUNT,
    mentions_price,
)
from shop_agent.domain.models import Severity

LOW_OPTION_COST_VND = 5_000_000  # v1 MAX_AUTO_APPROVE_COST: 200 internal units


def action_tier(action: ActionDraft | ActionSpec, measured_platforms: frozenset[str] = frozenset()) -> RiskTier:
    body = action.body
    if action.write_class is WriteClass.PROTECTIVE:
        return RiskTier.PROTECTIVE
    if action.type == "apply_discount":
        if body.get("category"):
            return RiskTier.HIGH  # category-wide promotions are always high
        low = (
            float(body["percent"]) <= LOW_DISCOUNT_PCT
            and int(body["duration_days"]) <= LOW_DISCOUNT_DAYS
            and len(body["skus"]) <= LOW_SKU_COUNT
        )
        return RiskTier.LOW if low else RiskTier.MEDIUM
    if action.type == "create_coupon":
        low = int(body["percent"]) <= LOW_COUPON_PCT and int(body["duration_days"]) <= LOW_COUPON_DAYS
        return RiskTier.LOW if low else RiskTier.MEDIUM
    if action.type == "create_campaign":
        return RiskTier.LOW if int(body.get("budget_vnd", 0)) <= LOW_CAMPAIGN_BUDGET_VND else RiskTier.MEDIUM
    if action.type == "create_post":
        return RiskTier.MEDIUM if mentions_price(str(body["message"])) else RiskTier.LOW
    if action.type == "create_ad":
        if str(body["platform"]) not in measured_platforms:
            return RiskTier.HIGH  # a platform's first campaign
        daily, days = int(body["daily_budget_vnd"]), int(body["duration_days"])
        low = daily <= LOW_AD_DAILY_VND and daily * days <= LOW_AD_TOTAL_VND and days <= LOW_AD_DAYS
        return RiskTier.LOW if low else RiskTier.MEDIUM
    if action.type in ("activate_ad", "set_ad_budget", "set_ad_optimization"):
        return RiskTier.MEDIUM  # an option that creates the ad carries the ad's own tier
    if action.type == "switch_channel":
        return RiskTier.LOW if len(body["skus"]) <= LOW_SKU_COUNT else RiskTier.MEDIUM
    return RiskTier.LOW  # adjust_inventory, create_task, update_sop_checklist


def option_tier(actions: Sequence[ActionDraft | ActionSpec], estimate: Estimate, severity: Severity) -> RiskTier:
    """The option's tier: its riskiest action, raised to medium by cost, risk or severity (v1 autonomy rule)."""
    tiers = [action_tier(a) for a in actions]
    if (
        estimate.cost_vnd > LOW_OPTION_COST_VND
        or estimate.risk != "low"
        or severity in (Severity.HIGH, Severity.CRITICAL)
    ):
        tiers.append(RiskTier.MEDIUM)
    return max_tier(tiers)
