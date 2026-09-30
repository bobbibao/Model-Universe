from __future__ import annotations

from fastapi import APIRouter, Depends

from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.domain.models.measurement import MeasurementResult
from ci_agent.interfaces.http.auth import current_actor
from ci_agent.interfaces.http.dependencies import get_container
from ci_agent.interfaces.http.money import Money
from ci_agent.interfaces.http.schemas import CaseOut, KpiImpactOut

router = APIRouter(tags=["kpi"], dependencies=[Depends(current_actor)])


def _to_impact(imp: Improvement, m: MeasurementResult, money: Money) -> KpiImpactOut:
    return KpiImpactOut(improvement_id=imp.id, signal_kind=imp.signal.kind, signal_summary=imp.signal.summary,
                        strategy=imp.plan.strategy if imp.plan else None,
                        auto_approved=bool(imp.directive and imp.directive.auto_approved),
                        measured_at=m.measured_at, verdict=m.verdict.value, summary=m.summary,
                        deltas=[money.delta(d) for d in m.deltas])


def _to_case(case: CaseRecord) -> CaseOut:
    return CaseOut(id=case.id, improvement_id=case.improvement_id, signal_kind=case.signal_kind,
                   situation=case.situation, options_considered=list(case.options_considered),
                   decision=case.decision, strategy=case.strategy, outcome_verdict=case.outcome_verdict,
                   kpi_summary=dict(case.kpi_summary), lessons=list(case.lessons), tags=list(case.tags),
                   created_at=case.created_at)


@router.get("/kpi/impact", response_model=list[KpiImpactOut])
def kpi_impact(container: Container = Depends(get_container)):
    """Before/after KPI deltas of every measured, closed improvement, most recently measured first."""
    items = container.workflow.repo.list_by_status([ImprovementStatus.CLOSED])
    measured = [(i, i.measurement) for i in items if i.measurement is not None]
    measured.sort(key=lambda pair: pair[1].measured_at, reverse=True)
    money = Money(container.settings.money_unit_vnd)
    return [_to_impact(imp, m, money) for imp, m in measured]


@router.get("/cases", response_model=list[CaseOut])
def list_cases(container: Container = Depends(get_container)):
    """Case library, most recent first; includes rejections, expirations and failures."""
    return [_to_case(c) for c in container.workflow.case_memory.list_recent(100)]
