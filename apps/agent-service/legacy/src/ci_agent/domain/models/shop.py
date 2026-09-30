"""Shop-side value objects, already normalised for the domain.

The domain never sees the web app's own schema. Adapters map it to these
types (anti-corruption layer).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass(frozen=True)
class StockItem:
    sku: str
    name: str
    category: str
    quantity: int
    unit_cost: float
    unit_price: float
    days_in_stock: int
    channel: str = "web"
    condition: str = "new"  # new | open_box | damaged
    expiry_date: date | None = None


@dataclass(frozen=True)
class ReturnRecord:
    order_id: str
    sku: str
    reason: str
    condition: str
    returned_at: datetime
    refund_amount: float


@dataclass(frozen=True)
class FeedbackRecord:
    sku: str
    rating: int
    text: str
    created_at: datetime


@dataclass(frozen=True)
class ShopSnapshot:
    taken_at: datetime
    stock: tuple[StockItem, ...]
    returns: tuple[ReturnRecord, ...] = ()
    units_sold_30d: dict[str, int] = field(default_factory=dict)
    feedback: tuple[FeedbackRecord, ...] = ()

    def velocity(self, sku: str) -> float:
        """Average units sold per day over the last 30 days."""
        return self.units_sold_30d.get(sku, 0) / 30.0

    def items(self, skus: tuple[str, ...] | list[str]) -> list[StockItem]:
        by_sku = {i.sku: i for i in self.stock}
        return [by_sku[s] for s in skus if s in by_sku]
