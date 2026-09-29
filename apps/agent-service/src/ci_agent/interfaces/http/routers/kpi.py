from __future__ import annotations

from fastapi import APIRouter, Depends

from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.interfaces.http.auth import current_actor
from ci_agent.interfaces.http.dependencies import get_container
from ci_agent.interfaces.http.schemas import KpiImpactOut

router = APIRouter(tags=["kpi"], dependencies=[Depends(current_actor)])


@router.get("/kpi/impact", response_model=list[KpiImpactOut])
def kpi_impact(container: Container = Depends(get_container)):
    items = container.workflow.repo.list_by_status([ImprovementStatus.CLOSED])
    out = []
    for imp in items:
        if imp.measurement is None:
            continue
        out.append(KpiImpactOut(improvement_id=imp.id, verdict=imp.measurement.verdict.value,
                                summary=imp.measurement.summary,
                                deltas=[vars(d) for d in imp.measurement.deltas]))
    return out


@router.get("/cases")
def list_cases(container: Container = Depends(get_container)):
    return [vars(c) for c in container.workflow.case_memory.list_recent(100)]
