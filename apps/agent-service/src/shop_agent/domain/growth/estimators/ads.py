"""Paid ads on one platform: spend x ROAS, net of the spend."""

from __future__ import annotations

from shop_agent.domain.growth.defaults import Priors
from shop_agent.domain.growth.estimators.common import GrowthEstimate, confidence_of


def estimate_ads(platform: str, daily_budget_vnd: int, days: int, margin: float, priors: Priors) -> GrowthEstimate:
    roas = priors.get(f"ads.{platform}")
    spend = daily_budget_vnd * days

    def at(r: float) -> tuple[int, int]:
        revenue = spend * r
        return round(revenue), round(revenue * margin - spend)

    low, mid, high = at(roas.low), at(roas.mean), at(roas.high)
    return GrowthEstimate(
        lever=f"ads_{platform}",
        revenue_p10=low[0],
        revenue_p50=mid[0],
        revenue_p90=high[0],
        profit_p10=low[1],
        profit_p50=mid[1],
        profit_p90=high[1],
        spend_vnd=spend,
        confidence=confidence_of(roas),
        assumptions=(f"{platform} ROAS {roas.mean:g} (prior, range {roas.low:g}-{roas.high:g})",),
    )
