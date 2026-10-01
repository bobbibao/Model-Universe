"""Sales velocity, cover and order value from a growth snapshot: what the detectors, estimators and measurement share.

Velocities are units per day over complete days (today is still selling, so it is left out).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta

from shop_agent.domain.growth.snapshot import CatalogItem, GrowthSnapshot

FALLBACK_ORDER_VND = 500_000  # an average order when the shop has no sales history yet


def window(snapshot: GrowthSnapshot, days: int) -> tuple[date, date]:
    """The last `days` complete days."""
    last = snapshot.today - timedelta(days=1)
    return last - timedelta(days=days - 1), last


def units_between(snapshot: GrowthSnapshot, skus: Iterable[str], first: date, last: date) -> int:
    wanted = set(skus)
    return sum(row.units for row in snapshot.sku_sales_daily if row.sku in wanted and first <= row.day <= last)


def revenue_between(snapshot: GrowthSnapshot, skus: Iterable[str], first: date, last: date) -> int:
    wanted = set(skus)
    return sum(row.revenue_vnd for row in snapshot.sku_sales_daily if row.sku in wanted and first <= row.day <= last)


def velocity(snapshot: GrowthSnapshot, skus: Iterable[str], days: int) -> float:
    """Units per day of these SKUs together over the last `days` complete days."""
    first, last = window(snapshot, days)
    return units_between(snapshot, skus, first, last) / days


def cover_days(item: CatalogItem, daily_units: float) -> float:
    """Days the stock lasts at this velocity (infinite when nothing sells)."""
    if item.quantity <= 0:
        return 0.0
    return float("inf") if daily_units <= 0 else item.quantity / daily_units


def average_order_vnd(snapshot: GrowthSnapshot, days: int = 30) -> int:
    first, last = window(snapshot, days)
    rows = snapshot.sales_between(first, last)
    orders = sum(r.orders for r in rows)
    return round(sum(r.revenue_vnd for r in rows) / orders) if orders else FALLBACK_ORDER_VND


def gross_margin_ratio(snapshot: GrowthSnapshot, days: int = 30) -> float:
    """The shop's gross profit over revenue in the window (0.3 without history)."""
    first, last = window(snapshot, days)
    rows = snapshot.sales_between(first, last)
    revenue = sum(r.revenue_vnd for r in rows)
    return sum(r.gross_profit_vnd for r in rows) / revenue if revenue > 0 else 0.3


def is_new_arrival(item: CatalogItem, snapshot: GrowthSnapshot, days: int) -> bool:
    return item.created_at.date() > snapshot.today - timedelta(days=days)


def sellable_items(snapshot: GrowthSnapshot) -> list[CatalogItem]:
    return [item for item in snapshot.catalog if item.sellable and item.quantity > 0]
