"""Amounts leave the HTTP API in VND.

The domain works in an internal money unit (settings.money_unit_vnd VND per unit, see
infrastructure/shop/sql_read.py). Every amount a response carries is converted back here, so the web console
shows VND. Agent-written text (summaries, question bodies) is not converted yet: docs/ROADMAP.md T-03c.
"""
from __future__ import annotations

from ci_agent.domain.kpi import KPI_CATALOG
from ci_agent.domain.models.measurement import KpiDelta
from ci_agent.interfaces.http.schemas import KpiDeltaOut

# Signal metrics that are amounts (the others are counts, days or percentages).
MONEY_METRICS = frozenset({"value_at_risk"})


class Money:
    def __init__(self, unit_vnd: float) -> None:
        self._unit = unit_vnd

    def vnd(self, amount: float) -> float:
        return float(round(amount * self._unit))

    def metrics(self, metrics: dict[str, float]) -> dict[str, float]:
        return {name: self.vnd(value) if name in MONEY_METRICS else value for name, value in metrics.items()}

    def delta(self, delta: KpiDelta) -> KpiDeltaOut:
        kpi = KPI_CATALOG.get(delta.name)
        unit = kpi.unit if kpi else "number"
        convert = self.vnd if unit == "currency" else (lambda value: value)
        return KpiDeltaOut(name=delta.name, unit="vnd" if unit == "currency" else unit,
                           baseline=convert(delta.baseline), current=convert(delta.current),
                           delta_pct=delta.delta_pct, improved=delta.improved, improvement_pct=delta.improvement_pct)
