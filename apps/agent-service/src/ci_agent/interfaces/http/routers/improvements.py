from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ci_agent.application.errors import ApplicationError, ConflictError, NotFoundError, UnauthorizedError
from ci_agent.application.use_cases.submit_answer import Actor, SubmitAnswerCommand
from ci_agent.bootstrap.container import Container
from ci_agent.domain.models.human import AnswerDecision
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.interfaces.http.auth import current_actor
from ci_agent.interfaces.http.dependencies import get_container
from ci_agent.infrastructure.shop.sql_read import ShopReadUnavailable
from ci_agent.interfaces.http.money import Money
from ci_agent.interfaces.http.schemas import (ActionRecordOut, AnswerOut, CauseOut, DecisionIn, FindingOut,
                                              HistoryOut, ImprovementDetailOut, ImprovementOut, MeasurementOut,
                                              OptionOut, PlannedActionOut, PlanOut, QuestionOut)

router = APIRouter(prefix="/improvements", tags=["improvements"], dependencies=[Depends(current_actor)])

_ERROR_STATUS = {NotFoundError: 404, ConflictError: 409, UnauthorizedError: 403}


def _option(option: OptionPreview, money: Money) -> OptionOut:
    return OptionOut(**{**vars(option), "est_recovery_value": money.vnd(option.est_recovery_value),
                        "est_cost": money.vnd(option.est_cost),
                        "est_waste_reduction": money.vnd(option.est_waste_reduction)})


def _to_out(imp: Improvement, money: Money) -> ImprovementOut:
    options = imp.finding.options if imp.finding else ()
    return ImprovementOut(id=imp.id, status=imp.status.value, phase=imp.phase.value, signal_kind=imp.signal.kind,
                          summary=imp.signal.summary, severity=imp.signal.severity.value,
                          created_at=imp.created_at, updated_at=imp.updated_at,
                          options=[_option(o, money) for o in options],
                          question_id=imp.current_question.id if imp.current_question else None)


def _to_detail(imp: Improvement, money: Money) -> ImprovementDetailOut:
    f, q, p, m = imp.finding, imp.current_question or (imp.questions[-1] if imp.questions else None), imp.plan,         imp.measurement
    return ImprovementDetailOut(
        **_to_out(imp, money).model_dump(), subject_skus=list(imp.signal.subject_skus),
        metrics=money.metrics(dict(imp.signal.metrics)),
        finding=FindingOut(summary=f.summary, causes=[CauseOut(description=c.description, confidence=c.confidence,
                                                               source="ai" if c.evidence.get("source") == "llm"
                                                               else "rules")
                                                      for c in f.causes],
                           sop_refs=list(f.sop_refs), similar_case_ids=list(f.similar_case_ids),
                           actionable=f.actionable, confidence=f.confidence) if f else None,
        question=QuestionOut(id=q.id, prompt=q.prompt, context=q.context, status=q.status.value, attempt=q.attempt,
                             created_at=q.created_at, expires_at=q.expires_at,
                             recommended_option_id=q.recommended_option_id) if q else None,
        answers=[AnswerOut(question_id=a.question_id, decision=a.decision.value, answered_by=a.answered_by,
                           channel=a.channel, answered_at=a.answered_at, option_id=a.option_id, note=a.note)
                 for a in imp.answers],
        history=[HistoryOut(status=h.status.value, at=h.at, note=h.note) for h in imp.history],
        plan=PlanOut(strategy=p.strategy, plan_hash=p.plan_hash, estimated_cost=money.vnd(p.estimated_cost),
                     evaluate_after_days=p.measurement_plan.evaluate_after_days,
                     actions=[PlannedActionOut(type=a.type, params=a.params, description=a.description)
                              for a in p.actions]) if p else None,
        action_records=[ActionRecordOut(step=r.step, type=r.type, status=r.status.value, detail=r.detail,
                                        executed_at=r.executed_at) for r in imp.action_records],
        measure_due_at=imp.measure_due_at,
        measurement=MeasurementOut(verdict=m.verdict.value, summary=m.summary, measured_at=m.measured_at,
                                   deltas=[money.delta(d) for d in m.deltas]) if m else None,
        case_id=imp.case_id)


def _raise(exc: ApplicationError) -> None:
    raise HTTPException(_ERROR_STATUS.get(type(exc), 400), str(exc))


@router.get("", response_model=list[ImprovementOut])
def list_improvements(status: str | None = Query(default=None), container: Container = Depends(get_container)):
    repo = container.workflow.repo
    if status:
        try:
            statuses = [ImprovementStatus(status)]
        except ValueError:
            raise HTTPException(400, f"Unknown status {status!r}") from None
        items = repo.list_by_status(statuses)
    else:
        items = repo.list_recent(100)
    money = Money(container.settings.money_unit_vnd)
    return [_to_out(i, money) for i in items]


@router.get("/{improvement_id}", response_model=ImprovementDetailOut)
def get_improvement(improvement_id: str, container: Container = Depends(get_container)):
    imp = container.workflow.repo.get(improvement_id)
    if imp is None:
        raise HTTPException(404, "Improvement not found")
    return _to_detail(imp, Money(container.settings.money_unit_vnd))


@router.post("/{improvement_id}/decision", response_model=ImprovementOut, status_code=202)
def decide(improvement_id: str, body: DecisionIn, actor: Actor = Depends(current_actor),
          container: Container = Depends(get_container)):
    imp = container.workflow.repo.get(improvement_id)
    if imp is None:
        raise HTTPException(404, "Improvement not found")
    if imp.current_question is None:
        raise HTTPException(409, "The question is no longer open")
    cmd = SubmitAnswerCommand(imp.current_question.id, AnswerDecision(body.decision), actor,
                              body.option_id, body.overrides, body.note)
    try:
        updated = container.workflow.coordinator.submit_answer(cmd)
    except ApplicationError as exc:
        _raise(exc)
    except ShopReadUnavailable as exc:
        # The answer is saved before the automatic phases run; only continuing (plan, act) had to stop.
        raise HTTPException(503, f"Decision recorded, but the shop could not be read to continue ({exc}); "
                                 "the next run will continue it.") from exc
    return _to_out(updated, Money(container.settings.money_unit_vnd))
