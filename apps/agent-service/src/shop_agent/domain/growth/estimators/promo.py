"""Promotions: a percentage discount on SKUs, and a cart coupon."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from shop_agent.domain.growth.defaults import Priors
from shop_agent.domain.growth.estimators.common import GrowthEstimate, confidence_of


@dataclass(frozen=True)
class PromoItem:
    sku: str
    price_vnd: int  # list price
    cost_vnd: int
    daily_units: float  # current velocity
    quantity: int  # stock: incremental sales cannot exceed it


def estimate_discount(items: Sequence[PromoItem], percent: float, days: int, priors: Priors) -> GrowthEstimate:
    """Units sold anyway keep selling at the lower price (the discount's cost); extra units come from the uplift."""
    prior = priors.get("promotion.uplift_per_pct")
    base_units = sum(i.daily_units * days for i in items)
    discount_cost = round(sum(i.daily_units * days * i.price_vnd * percent / 100 for i in items))

    def at(uplift_per_pct: float) -> tuple[int, int]:
        revenue = profit = 0.0
        for i in items:
            base = i.daily_units * days
            extra = min(base * uplift_per_pct * percent, max(i.quantity - base, 0))
            sale = i.price_vnd * (1 - percent / 100)
            revenue += extra * sale
            profit += extra * (sale - i.cost_vnd) - base * i.price_vnd * percent / 100
        return round(revenue), round(profit)

    low, mid, high = at(prior.low), at(prior.mean), at(prior.high)
    return GrowthEstimate(
        lever="discount",
        revenue_p10=low[0],
        revenue_p50=mid[0],
        revenue_p90=high[0],
        profit_p10=low[1],
        profit_p50=mid[1],
        profit_p90=high[1],
        discount_cost_vnd=discount_cost,
        confidence=confidence_of(prior),
        assumptions=(
            f"{base_units:.0f} units would sell anyway in {days} days",
            f"each 1% off adds {prior.mean * 100:.1f}% units (prior)",
        ),
    )


def estimate_coupon(
    daily_orders: float, order_vnd: int, margin: float, percent: float, days: int, priors: Priors
) -> GrowthEstimate:
    redemption, incremental = priors.get("coupon.redemption"), priors.get("coupon.incremental")
    redeemed = daily_orders * days * redemption.mean
    discount_cost = round(redeemed * (1 - incremental.mean) * order_vnd * percent / 100)

    def at(share: float) -> tuple[int, int]:
        new_orders = redeemed * share
        revenue = new_orders * order_vnd * (1 - percent / 100)
        profit = new_orders * order_vnd * (margin - percent / 100) - redeemed * (1 - share) * order_vnd * percent / 100
        return round(revenue), round(profit)

    low, mid, high = at(incremental.low), at(incremental.mean), at(incremental.high)
    return GrowthEstimate(
        lever="coupon",
        revenue_p10=low[0],
        revenue_p50=mid[0],
        revenue_p90=high[0],
        profit_p10=low[1],
        profit_p50=mid[1],
        profit_p90=high[1],
        discount_cost_vnd=discount_cost,
        confidence=confidence_of(incremental),
        assumptions=(f"{redemption.mean:.0%} of orders use it; {incremental.mean:.0%} of those are new (priors)",),
    )
