"""An organic Facebook post: views -> clicks -> orders (no media cost)."""

from __future__ import annotations

from shop_agent.domain.growth.defaults import Priors
from shop_agent.domain.growth.estimators.common import GrowthEstimate, confidence_of


def estimate_post(order_vnd: int, margin: float, priors: Priors) -> GrowthEstimate:
    views, clicks, orders = priors.get("post.views"), priors.get("post.click_rate"), priors.get("post.order_rate")

    def at(v: float, c: float, o: float) -> tuple[int, int]:
        revenue = v * c * o * order_vnd
        return round(revenue), round(revenue * margin)

    low = at(views.low, clicks.low, orders.low)
    mid = at(views.mean, clicks.mean, orders.mean)
    high = at(views.high, clicks.high, orders.high)
    return GrowthEstimate(
        lever="post",
        revenue_p10=low[0],
        revenue_p50=mid[0],
        revenue_p90=high[0],
        profit_p10=low[1],
        profit_p50=mid[1],
        profit_p90=high[1],
        confidence=min(confidence_of(views), confidence_of(clicks), confidence_of(orders)),
        assumptions=(f"{views.mean:.0f} views, {clicks.mean:.1%} click, {orders.mean:.1%} order (priors)",),
    )
