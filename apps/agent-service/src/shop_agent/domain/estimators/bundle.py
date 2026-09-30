from __future__ import annotations

from collections.abc import Sequence

from shop_agent.domain.estimators.common import Estimate, cost_basis, in_stock, retail_value, unit_count, vnd
from shop_agent.domain.money import format_vnd
from shop_agent.domain.shop import ShopSnapshot, StockItem

PACKAGING_PER_UNIT_VND = 12_500  # v1: 0.5 internal units
BUNDLE_SELL_THROUGH = 0.5
MIN_ANCHOR_VELOCITY = 0.5  # units per day


def eligible(items: Sequence[StockItem]) -> list[StockItem]:
    return [i for i in in_stock(items) if i.condition != "damaged"]


def anchor_sku(snapshot: ShopSnapshot, exclude: Sequence[str]) -> str | None:
    """The best seller outside the opportunity, if it sells well enough to carry a bundle."""
    excluded = set(exclude)
    candidates = [i for i in snapshot.stock if i.sku not in excluded and i.quantity > 0]
    if not candidates:
        return None
    best = max(candidates, key=lambda i: snapshot.velocity(i.sku))
    return best.sku if snapshot.velocity(best.sku) > MIN_ANCHOR_VELOCITY else None


def estimate(items: Sequence[StockItem], bundle_discount_pct: float) -> Estimate:
    return Estimate(
        recovery_vnd=vnd(retail_value(items) * (1 - bundle_discount_pct / 100) * BUNDLE_SELL_THROUGH),
        cost_vnd=PACKAGING_PER_UNIT_VND * unit_count(items),
        waste_reduction_vnd=vnd(cost_basis(items) * BUNDLE_SELL_THROUGH),
        risk="low",
        assumptions=("Bán được 50% số lượng trong combo", f"Đóng gói {format_vnd(PACKAGING_PER_UNIT_VND)}/sản phẩm"),
    )
