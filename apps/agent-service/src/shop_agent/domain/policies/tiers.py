"""Risk tiers for the operational actions (dead stock, returns). Growth actions add their rules in Phase 7.

A tier decides whether an action may run under the `auto_low` autonomy mode; everything above `low` asks a person.
"""

from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.actions import ActionDraft, ActionSpec
from shop_agent.domain.capabilities import RiskTier, max_tier
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.models import Severity

LOW_DISCOUNT_PCT = 15.0
LOW_DISCOUNT_DAYS = 7
LOW_SKU_COUNT = 20
LOW_OPTION_COST_VND = 5_000_000  # v1 MAX_AUTO_APPROVE_COST: 200 internal units


def action_tier(action: ActionDraft | ActionSpec) -> RiskTier:
    body = action.body
    if action.type == "apply_discount":
        low = (
            float(body["percent"]) <= LOW_DISCOUNT_PCT
            and int(body["duration_days"]) <= LOW_DISCOUNT_DAYS
            and len(body["skus"]) <= LOW_SKU_COUNT
        )
        return RiskTier.LOW if low else RiskTier.MEDIUM
    if action.type == "switch_channel":
        return RiskTier.LOW if len(body["skus"]) <= LOW_SKU_COUNT else RiskTier.MEDIUM
    if action.type == "adjust_inventory":
        return RiskTier.LOW
    return RiskTier.LOW  # create_task, update_sop_checklist


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
