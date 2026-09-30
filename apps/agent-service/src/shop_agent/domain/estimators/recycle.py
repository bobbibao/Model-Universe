from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from shop_agent.domain.estimators.common import Estimate, cost_basis, in_stock, is_expired, unit_count, vnd
from shop_agent.domain.shop import StockItem

DISPOSAL_PER_UNIT_VND = 7_500  # v1: 0.3 internal units


def eligible(items: Sequence[StockItem], now: datetime) -> list[StockItem]:
    return [i for i in in_stock(items) if i.condition == "damaged" or is_expired(i, now)]


def estimate(items: Sequence[StockItem]) -> Estimate:
    return Estimate(
        recovery_vnd=vnd(cost_basis(items) * 0.05),
        cost_vnd=DISPOSAL_PER_UNIT_VND * unit_count(items),
        waste_reduction_vnd=vnd(cost_basis(items) * 0.95),
        risk="medium",
        assumptions=("Giá trị thu hồi khoảng 5% giá vốn", "Xử lý theo quy định địa phương"),
    )
