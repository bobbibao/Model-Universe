"""KPI catalog. Measure compares these before/after an improvement."""
from __future__ import annotations

from dataclasses import dataclass

from ci_agent.domain.errors import RuleViolation

DEAD_STOCK_VALUE = "dead_stock_value"
RETURN_RATE_PCT = "return_rate_pct"
RECOVERED_VALUE = "recovered_value"
AVG_DAYS_IN_STOCK = "avg_days_in_stock"


@dataclass(frozen=True)
class KpiDefinition:
    name: str
    unit: str
    higher_is_better: bool
    description: str


KPI_CATALOG: dict[str, KpiDefinition] = {
    k.name: k
    for k in (
        KpiDefinition(DEAD_STOCK_VALUE, "currency", False, "Cost value of stock that is old and barely selling"),
        KpiDefinition(RETURN_RATE_PCT, "percent", False, "Returns divided by units sold, last 30 days"),
        KpiDefinition(RECOVERED_VALUE, "currency", True, "Cumulative revenue recovered through clearance actions"),
        KpiDefinition(AVG_DAYS_IN_STOCK, "days", False, "Average days in stock across on-hand items"),
    )
}


def get_kpi(name: str) -> KpiDefinition:
    try:
        return KPI_CATALOG[name]
    except KeyError as exc:
        raise RuleViolation(f"Unknown KPI: {name!r}") from exc
