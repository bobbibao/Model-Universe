"""Measure: KPIs now against the baseline captured just before Act. Deterministic."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from shop_agent.domain.kpi import DEAD_STOCK_VALUE, RETURN_RATE_PCT, get_kpi
from shop_agent.domain.money import format_vnd


@dataclass(frozen=True)
class MeasurementPlan:
    kpis: tuple[str, ...]
    evaluate_after_days: int
    min_improvement_pct: float = 5.0


MEASUREMENT_PLANS: dict[str, MeasurementPlan] = {
    "dead_stock": MeasurementPlan((DEAD_STOCK_VALUE,), 14, 10.0),
    "high_returns": MeasurementPlan((RETURN_RATE_PCT,), 14, 10.0),
}


def measurement_plan_for(kind: str) -> MeasurementPlan:
    return MEASUREMENT_PLANS.get(kind, MeasurementPlan((DEAD_STOCK_VALUE,), 14, 10.0))


class Verdict(StrEnum):
    SUCCESS = "success"
    INCONCLUSIVE = "inconclusive"
    NEGATIVE = "negative"


@dataclass(frozen=True)
class KpiDelta:
    name: str
    baseline: float
    current: float
    delta_pct: float  # signed change, (current - baseline) / |baseline| * 100
    improved: bool
    improvement_pct: float  # positive when better, negative when worse


@dataclass(frozen=True)
class MeasurementResult:
    deltas: tuple[KpiDelta, ...]
    verdict: Verdict
    measured_at: datetime
    summary: str


def _delta_pct(baseline: float, current: float) -> float:
    if baseline == 0:
        return 0.0 if current == 0 else 100.0
    return (current - baseline) / abs(baseline) * 100.0


def _show(name: str, value: float) -> str:
    unit = get_kpi(name).unit
    if unit == "vnd":
        return format_vnd(value)
    if unit == "percent":
        return f"{value:g}%"
    return f"{value:g} ngày"


def evaluate(
    plan: MeasurementPlan, baseline: dict[str, float], current: dict[str, float], now: datetime
) -> MeasurementResult:
    deltas: list[KpiDelta] = []
    for name in plan.kpis:
        kpi = get_kpi(name)
        base, cur = baseline.get(name, 0.0), current.get(name, 0.0)
        pct = _delta_pct(base, cur)
        improved = pct > 0 if kpi.higher_is_better else pct < 0
        magnitude = abs(pct) if improved else -abs(pct)
        deltas.append(KpiDelta(name, base, cur, round(pct, 2), improved, round(magnitude, 2)))
    if deltas and all(d.improvement_pct >= plan.min_improvement_pct for d in deltas):
        verdict = Verdict.SUCCESS
    elif any(d.improvement_pct <= -plan.min_improvement_pct for d in deltas):
        verdict = Verdict.NEGATIVE
    else:
        verdict = Verdict.INCONCLUSIVE
    summary = "; ".join(
        f"{get_kpi(d.name).label}: {_show(d.name, d.baseline)} -> {_show(d.name, d.current)} "
        f"({'tốt hơn' if d.improvement_pct >= 0 else 'kém hơn'} {abs(d.improvement_pct):.1f}%)"
        for d in deltas
    )
    return MeasurementResult(tuple(deltas), verdict, now, summary)
