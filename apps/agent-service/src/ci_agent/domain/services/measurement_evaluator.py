"""Measure phase: compare KPIs against the baseline captured just before Act."""
from __future__ import annotations

from datetime import datetime

from ci_agent.domain.kpi import get_kpi
from ci_agent.domain.models.measurement import KpiDelta, MeasurementResult, Verdict
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.plan import MeasurementPlan


def _delta_pct(baseline: float, current: float) -> float:
    if baseline == 0:
        return 0.0 if current == 0 else 100.0
    return (current - baseline) / abs(baseline) * 100.0


def evaluate(plan: MeasurementPlan, baseline: dict[str, float], current: dict[str, float],
             now: datetime, money: MoneyFormat | None = None) -> MeasurementResult:
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
    money = money or MoneyFormat()

    def value(name: str, amount: float) -> str:
        # Amounts go through `money` (VND when configured; never scientific notation); other KPIs as before.
        return money.text(amount, "g") if get_kpi(name).unit == "currency" else format(amount, "g")

    summary = "; ".join(f"{d.name}: {value(d.name, d.baseline)} -> {value(d.name, d.current)} "
                        f"({d.improvement_pct:+.1f}% better)"
                        for d in deltas)
    return MeasurementResult(tuple(deltas), verdict, now, summary)
