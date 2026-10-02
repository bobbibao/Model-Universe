"""Shop-side value objects, already normalised for the domain (money in whole VND).

Adapters map the web shop's analytics views to these types; the domain never sees the web schema.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass(frozen=True)
class StockItem:
    sku: str
    name: str
    category: str
    quantity: int
    unit_cost_vnd: int
    unit_price_vnd: int
    days_in_stock: int
    channel: str = "web"
    condition: str = "new"  # new | open_box | damaged
    expiry_date: date | None = None


@dataclass(frozen=True)
class ReturnRecord:
    """One returned unit."""

    order_id: str
    sku: str
    reason: str
    condition: str
    returned_at: datetime
    refund_vnd: int


@dataclass(frozen=True)
class ShopSnapshot:
    taken_at: datetime
    stock: tuple[StockItem, ...]
    returns: tuple[ReturnRecord, ...] = ()
    units_sold_30d: dict[str, int] = field(default_factory=dict)
    recovered_vnd: int = 0  # cumulative clearance revenue (analytics.clearance_sales)

    def velocity(self, sku: str) -> float:
        """Average units sold per day over the last 30 days."""
        return self.units_sold_30d.get(sku, 0) / 30.0

    def items(self, skus: Sequence[str]) -> list[StockItem]:
        by_sku = {i.sku: i for i in self.stock}
        return [by_sku[s] for s in skus if s in by_sku]
