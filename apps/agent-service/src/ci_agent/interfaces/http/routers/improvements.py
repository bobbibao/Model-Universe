from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ci_agent.application.errors import ApplicationError, ConflictError, NotFoundError, UnauthorizedError
from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.interfaces.http.auth import current_actor
from ci_agent.interfaces.http.dependencies import get_container
from ci_agent.interfaces.http.schemas import DecisionIn, ImprovementOut, OptionOut

router = APIRouter(prefix="/improvements", tags=["improvements"])

_ERROR_STATUS = {NotFoundError: 404, ConflictError: 409, UnauthorizedError: 403}


def _to_out(imp: Improvement) -> ImprovementOut:
    options = imp.finding.options if imp.finding else ()
    return ImprovementOut(id=imp.id, status=imp.status.value, phase=imp.phase.value, signal_kind=imp.signal.kind,
                          summary=imp.signal.summary, severity=imp.signal.severity.value,
                          created_at=imp.created_at, updated_at=imp.updated_at,
                          options=[OptionOut(**vars(o)) for o in options],
                          question_id=imp.current_question.id if imp.current_question else None)


def _raise(exc: ApplicationError) -> None:
    raise HTTPException(_ERROR_STATUS.get(type(exc), 400), str(exc))


@router.get("", response_model=list[ImprovementOut])
def list_improvements(status: str | None = Query(default=None), container: Container = Depends(get_container)):
    repo = container.workflow.repo
    if status:
        items = repo.list_by_status([ImprovementStatus(status)])
    else:
        items = repo.list_recent(100)
    return [_to_out(i) for i in items]


@router.get("/{improvement_id}", response_model=ImprovementOut)
def get_improvement(improvement_id: str, container: Container = Depends(get_container)):
    imp = container.workflow.repo.get(improvement_id)
    if imp is None:
        raise HTTPException(404, "Improvement not found")
    return _to_out(imp)


@router.post("/{improvement_id}/decision", response_model=ImprovementOut, status_code=202)
def decide(improvement_id: str, body: DecisionIn, actor: Actor = Depends(current_actor),
          container: Container = Depends(get_container)):
    imp = container.workflow.repo.get(improvement_id)
    if imp is None or imp.current_question is None:
        raise HTTPException(404, "No open question for this improvement")
    cmd = SubmitAnswerCommand(imp.current_question.id, AnswerDecision(body.decision), actor,
                              body.option_id, body.overrides, body.note)
    try:
        updated = container.workflow.coordinator.submit_answer(cmd)
    except ApplicationError as exc:
        _raise(exc)
    return _to_out(updated)
