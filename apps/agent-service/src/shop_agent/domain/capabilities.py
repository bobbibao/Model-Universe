"""What an action is allowed to be, and how risky it is (ADR-0011)."""

from __future__ import annotations

from enum import StrEnum


class Capability(StrEnum):
    PROMOTION = "promotion"  # discounts, coupons
    FACEBOOK_POST = "facebook_post"
    ADS_META = "ads_meta"
    ADS_GOOGLE = "ads_google"
    ADS_TIKTOK = "ads_tiktok"
    INVENTORY = "inventory"  # adjust_inventory, switch_channel
    OPS_TASKS = "ops_tasks"  # create_task, update_sop_checklist


class WriteClass(StrEnum):
    SHOP_CHANGE = "shop_change"  # needs an approval grant or the auto rule
    PROTECTIVE = "protective"  # always allowed, audited, admins notified
    INGESTION = "ingestion"  # data only: observations, metrics, outcomes, notifications


class RiskTier(StrEnum):
    PROTECTIVE = "protective"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BLOCKED = "blocked"


TIER_RANK = {
    RiskTier.PROTECTIVE: 0,
    RiskTier.LOW: 1,
    RiskTier.MEDIUM: 2,
    RiskTier.HIGH: 3,
    RiskTier.BLOCKED: 4,
}


def max_tier(tiers: list[RiskTier]) -> RiskTier:
    return max(tiers, key=TIER_RANK.__getitem__, default=RiskTier.LOW)
