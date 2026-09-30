from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.estimators.common import Estimate, cost_basis, in_stock, unit_count, vnd
from shop_agent.domain.money import format_vnd
from shop_agent.domain.shop import StockItem

LOGISTICS_PER_UNIT_VND = 12_500  # v1: 0.5 internal units
TAX_BENEFIT_SHARE = 0.1


def eligible(items: Sequence[StockItem]) -> list[StockItem]:
    return [i for i in in_stock(items) if i.condition != "damaged"]


def estimate(items: Sequence[StockItem]) -> Estimate:
    return Estimate(
        recovery_vnd=vnd(cost_basis(items) * TAX_BENEFIT_SHARE),
        cost_vnd=LOGISTICS_PER_UNIT_VND * unit_count(items),
        waste_reduction_vnd=vnd(cost_basis(items) * 0.9),
        risk="low",
        assumptions=(
            "Lợi ích thuế khoảng 10% giá vốn (cần kế toán xác nhận)",
            f"Vận chuyển {format_vnd(LOGISTICS_PER_UNIT_VND)}/sản phẩm",
        ),
    )
