from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.estimators.common import Estimate, cost_basis, in_stock, retail_value, vnd
from shop_agent.domain.shop import StockItem

OUTLET_PRICE_SHARE = 0.5
OUTLET_SELL_THROUGH = 0.6
CHANNEL_FEE = 0.08


def eligible(items: Sequence[StockItem]) -> list[StockItem]:
    return [
        i
        for i in in_stock(items)
        if i.channel != "outlet" and i.condition != "damaged" and (i.days_in_stock >= 180 or i.condition == "open_box")
    ]


def estimate(items: Sequence[StockItem]) -> Estimate:
    revenue = retail_value(items) * OUTLET_PRICE_SHARE * OUTLET_SELL_THROUGH
    return Estimate(
        recovery_vnd=vnd(revenue),
        cost_vnd=vnd(revenue * CHANNEL_FEE),
        waste_reduction_vnd=vnd(cost_basis(items) * OUTLET_SELL_THROUGH),
        risk="low",
        assumptions=("Giá outlet khoảng 50% giá bán, bán được 60%", "Phí kênh 8%"),
    )
