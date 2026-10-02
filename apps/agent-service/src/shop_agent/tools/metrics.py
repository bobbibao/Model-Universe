"""Curated, repeatable reads of the shop (analytics views through ShopReader). Numbers come from the domain."""

from __future__ import annotations

from collections import Counter

from langchain.tools import tool

from shop_agent.domain.detectors import DeadStockDetector, HighReturnRateDetector
from shop_agent.domain.kpi import KPI_CATALOG
from shop_agent.domain.kpi_calc import snapshot_kpis
from shop_agent.domain.money import format_vnd
from shop_agent.tools.deps import ShopToolRuntime, get_deps

MAX_ROWS = 25


@tool
async def find_dead_stock(runtime: ShopToolRuntime) -> str:
    """List dead stock: SKUs in stock 90+ days that sell at most 0.2 units a day (SOP-001), worst value first."""
    deps = await get_deps(runtime)
    now = deps.clock()
    snapshot = await deps.reader.snapshot(now)
    opportunities = DeadStockDetector().detect(snapshot, now)
    if not opportunities:
        return "No dead stock."
    items = sorted(snapshot.items(opportunities[0].skus), key=lambda i: i.quantity * i.unit_cost_vnd, reverse=True)
    lines = [opportunities[0].summary]
    lines += [
        f"- {i.sku} ({i.name}, {i.category}): {i.quantity} units, {i.days_in_stock} days, "
        f"{snapshot.velocity(i.sku):.2f}/day, cost value {format_vnd(i.quantity * i.unit_cost_vnd)}, "
        f"price {format_vnd(i.unit_price_vnd)}, channel {i.channel}, condition {i.condition}"
        for i in items[:MAX_ROWS]
    ]
    if len(items) > MAX_ROWS:
        lines.append(f"... and {len(items) - MAX_ROWS} more")
    return "\n".join(lines)


@tool
async def find_high_return_skus(runtime: ShopToolRuntime) -> str:
    """List SKUs whose 30-day return rate is above the SOP-002 threshold, with their return reasons."""
    deps = await get_deps(runtime)
    now = deps.clock()
    snapshot = await deps.reader.snapshot(now)
    opportunities = HighReturnRateDetector().detect(snapshot, now)
    if not opportunities:
        return "No SKU above the return-rate threshold."
    lines = [opportunities[0].summary]
    for sku in opportunities[0].skus[:MAX_ROWS]:
        returns = [r for r in snapshot.returns if r.sku == sku]
        sold = snapshot.units_sold_30d.get(sku, 0)
        reasons = ", ".join(f"{reason} x{n}" for reason, n in Counter(r.reason for r in returns).most_common())
        conditions = ", ".join(f"{c} x{n}" for c, n in Counter(r.condition for r in returns).most_common())
        lines.append(f"- {sku}: {len(returns)} returned of {sold} sold; reasons: {reasons}; conditions: {conditions}")
    return "\n".join(lines)


@tool
async def get_stock(skus: list[str], runtime: ShopToolRuntime) -> str:
    """Stock level, age, sales velocity, cost and price of the given SKUs."""
    deps = await get_deps(runtime)
    snapshot = await deps.reader.snapshot(deps.clock())
    items = snapshot.items(skus[:MAX_ROWS])
    if not items:
        return "None of these SKUs is in the shop."
    return "\n".join(
        f"- {i.sku} ({i.name}): {i.quantity} units, {i.days_in_stock} days in stock, "
        f"{snapshot.velocity(i.sku):.2f}/day, cost {format_vnd(i.unit_cost_vnd)}, price {format_vnd(i.unit_price_vnd)}"
        for i in items
    )


@tool
async def get_kpis(runtime: ShopToolRuntime) -> str:
    """The shop's operational KPIs now (dead-stock value, return rate, days in stock, clearance revenue)."""
    deps = await get_deps(runtime)
    values = snapshot_kpis(await deps.reader.snapshot(deps.clock()))
    lines = []
    for name, value in values.items():
        kpi = KPI_CATALOG[name]
        shown = format_vnd(value) if kpi.unit == "vnd" else f"{value:g}{'%' if kpi.unit == 'percent' else ' days'}"
        lines.append(f"- {kpi.label} ({name}): {shown}")
    return "\n".join(lines)


METRIC_TOOLS = [find_dead_stock, find_high_return_skus, get_stock, get_kpis]
