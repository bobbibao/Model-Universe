from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from shop_agent.domain.estimators.common import Estimate, cost_basis, in_stock, is_expired, retail_value, vnd
from shop_agent.domain.shop import StockItem


def sell_through(percent: float) -> float:
    """Share of the units expected to sell during the promotion."""
    return min(0.85, 0.25 + 0.015 * percent)


def eligible(items: Sequence[StockItem], now: datetime) -> list[StockItem]:
    return [i for i in in_stock(items) if i.condition != "damaged" and not is_expired(i, now)]


def estimate(items: Sequence[StockItem], percent: float) -> Estimate:
    rate = sell_through(percent)
    return Estimate(
        recovery_vnd=vnd(retail_value(items) * (1 - percent / 100) * rate),
        cost_vnd=0,
        waste_reduction_vnd=vnd(cost_basis(items) * rate),
        risk="low" if percent <= 30 else "medium",
        assumptions=(f"Ước tính bán được {rate:.0%} số lượng trong thời gian giảm giá",),
    )
