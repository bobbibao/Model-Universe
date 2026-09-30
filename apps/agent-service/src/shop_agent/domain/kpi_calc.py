"""KPI values from a snapshot. Every ShopReader (SQL views, FakeShop) uses these, so Measure compares like with like."""

from __future__ import annotations

from shop_agent.domain.kpi import AVG_DAYS_IN_STOCK, DEAD_STOCK_VALUE, RECOVERED_VALUE, RETURN_RATE_PCT
from shop_agent.domain.shop import ShopSnapshot

# The dead-stock detector's defaults (SOP-001).
DEAD_STOCK_MIN_DAYS = 90
DEAD_STOCK_MAX_VELOCITY = 0.2


def snapshot_kpis(snapshot: ShopSnapshot) -> dict[str, float]:
    dead = sum(
        i.quantity * i.unit_cost_vnd
        for i in snapshot.stock
        if i.quantity > 0
        and i.days_in_stock >= DEAD_STOCK_MIN_DAYS
        and snapshot.velocity(i.sku) <= DEAD_STOCK_MAX_VELOCITY
    )
    on_hand = [i for i in snapshot.stock if i.quantity > 0]
    sold = sum(snapshot.units_sold_30d.values()) or 1
    return {
        DEAD_STOCK_VALUE: float(dead),
        # Returned units in the snapshot (one record per unit) per unit sold in the last 30 days.
        RETURN_RATE_PCT: round(len(snapshot.returns) / sold * 100.0, 3),
        AVG_DAYS_IN_STOCK: round(sum(i.days_in_stock for i in on_hand) / len(on_hand), 2) if on_hand else 0.0,
        RECOVERED_VALUE: float(snapshot.recovered_vnd),
    }
