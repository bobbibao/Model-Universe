from __future__ import annotations

from fastapi import APIRouter, Depends

from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.notification import Role
from ci_agent.interfaces.http.auth import require_role
from ci_agent.interfaces.http.dependencies import get_container

router = APIRouter(prefix="/runs", tags=["runs"], dependencies=[Depends(require_role(Role.MANAGER))])


@router.post("", status_code=202)
def trigger_run(container: Container = Depends(get_container)):
    """Manually trigger one Detect + advance-all cycle (the scheduler normally does this)."""
    report = container.workflow.coordinator.tick()
    return {"detected": report.detected, "expired": report.expired, "advanced": report.advanced,
            "errors": report.errors}
