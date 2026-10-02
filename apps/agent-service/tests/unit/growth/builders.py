"""Small growth snapshots for domain tests: a catalog, flat per-SKU daily sales, and the shop's daily totals."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

from shop_agent.domain.growth.snapshot import CatalogItem, DailySales, GrowthSnapshot, SkuDailySales

NOW = datetime(2026, 10, 15, 2, 0, tzinfo=UTC)  # 09:00 in Vietnam on 15 October
TODAY = date(2026, 10, 15)


def item(sku: str, *, category: str = "ao", price: int = 200_000, cost: int = 120_000, quantity: int = 50,
         created_days_ago: int = 200, discount_pct: float = 0.0) -> CatalogItem:  # fmt: skip
    return CatalogItem(
        sku=sku,
        name=f"Sản phẩm {sku}",
        brand="",
        category=category,
        category_name=category,
        price_vnd=price,
        sale_price_vnd=round(price * (100 - discount_pct) / 100),
        discount_pct=discount_pct,
        unit_cost_vnd=cost,
        quantity=quantity,
        inventory_status="available",
        sales_channel="web",
        is_archived=False,
        created_at=NOW - timedelta(days=created_days_ago),
    )


def sales(items: Sequence[CatalogItem], days: int, units: Callable[[CatalogItem, date], int]) -> list[SkuDailySales]:
    """Per-SKU rows for the `days` complete days before today."""
    rows = []
    for age in range(days, 0, -1):
        day = TODAY - timedelta(days=age)
        for i in items:
            n = units(i, day)
            if n:
                rows.append(SkuDailySales(day, i.sku, n, n * i.sale_price_vnd))
    return rows


def daily_totals(rows: Sequence[SkuDailySales], costs: Mapping[str, int]) -> tuple[DailySales, ...]:
    by_day: dict[date, list[SkuDailySales]] = {}
    for row in rows:
        by_day.setdefault(row.day, []).append(row)
    return tuple(
        DailySales(
            day=day,
            orders=sum(r.units for r in group),
            units=sum(r.units for r in group),
            revenue_vnd=sum(r.revenue_vnd for r in group),
            coupon_discount_vnd=0,
            gross_profit_vnd=sum(r.revenue_vnd - r.units * costs[r.sku] for r in group),
            attributed_orders=0,
        )
        for day, group in sorted(by_day.items())
    )


def snapshot(items: Sequence[CatalogItem], rows: Sequence[SkuDailySales], **fields: Any) -> GrowthSnapshot:
    costs = {i.sku: i.unit_cost_vnd for i in items}
    base = GrowthSnapshot(
        taken_at=NOW, catalog=tuple(items), sku_sales_daily=tuple(rows), sales_daily=daily_totals(rows, costs)
    )
    return replace(base, **fields)
