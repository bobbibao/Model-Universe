"""Small pure helpers shared by strategies."""
from __future__ import annotations

from datetime import datetime

from ci_agent.domain.kpi import DEAD_STOCK_VALUE, RECOVERED_VALUE, RETURN_RATE_PCT
from ci_agent.domain.models.plan import MeasurementPlan
from ci_agent.domain.models.shop import StockItem
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies.base import StrategyContext


def signal_items(signal: Signal, ctx: StrategyContext) -> list[StockItem]:
    return [i for i in ctx.snapshot.items(signal.subject_skus) if i.quantity > 0]


def is_expired(item: StockItem, now: datetime) -> bool:
    return item.expiry_date is not None and item.expiry_date < now.date()


def cost_basis(items: list[StockItem]) -> float:
    return sum(i.quantity * i.unit_cost for i in items)


def retail_value(items: list[StockItem]) -> float:
    return sum(i.quantity * i.unit_price for i in items)


def unit_count(items: list[StockItem]) -> int:
    return sum(i.quantity for i in items)


_MEASUREMENT = {
    "dead_stock": MeasurementPlan((DEAD_STOCK_VALUE,), 14, 10.0),
    "near_expiry": MeasurementPlan((RECOVERED_VALUE,), 14, 10.0),
    "high_returns": MeasurementPlan((RETURN_RATE_PCT,), 14, 10.0),
}


def measurement_plan_for(kind: str) -> MeasurementPlan:
    return _MEASUREMENT.get(kind, MeasurementPlan((DEAD_STOCK_VALUE,), 14, 10.0))
