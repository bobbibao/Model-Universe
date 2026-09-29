"""KPI definitions shared by every ShopReadPort adapter (FakeShop, SqlShopReadAdapter), so Measure compares
like with like whichever shop is attached. Names and directions are in domain/kpi.py.

`recovered_value` is not derivable from a snapshot (it is cumulative revenue from clearance sales), so each
adapter supplies it.
"""
from __future__ import annotations

from ci_agent.domain.kpi import AVG_DAYS_IN_STOCK, DEAD_STOCK_VALUE, RETURN_RATE_PCT
from ci_agent.domain.models.shop import ShopSnapshot

# Same thresholds as the dead-stock detector's defaults (SOP-001).
DEAD_STOCK_MIN_DAYS = 90
DEAD_STOCK_MAX_VELOCITY = 0.2


def snapshot_kpis(snapshot: ShopSnapshot) -> dict[str, float]:
    dead = sum(i.quantity * i.unit_cost for i in snapshot.stock
               if i.quantity > 0 and i.days_in_stock >= DEAD_STOCK_MIN_DAYS
               and snapshot.velocity(i.sku) <= DEAD_STOCK_MAX_VELOCITY)
    on_hand = [i for i in snapshot.stock if i.quantity > 0]
    sold = sum(snapshot.units_sold_30d.values()) or 1
    return {
        DEAD_STOCK_VALUE: round(dead, 2),
        # Returned units in the snapshot (one record per unit) per unit sold in the last 30 days.
        RETURN_RATE_PCT: round(len(snapshot.returns) / sold * 100.0, 3),
        AVG_DAYS_IN_STOCK: round(sum(i.days_in_stock for i in on_hand) / len(on_hand), 2) if on_hand else 0.0,
    }
