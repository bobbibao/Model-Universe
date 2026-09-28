"""Phase 7 - Learn: store the outcome (including rejections and failures) as a reusable case."""
from __future__ import annotations

from ci_agent.application.errors import NotFoundError
from ci_agent.application.ports.knowledge import CaseMemoryPort
from ci_agent.application.ports.reasoning import LessonInput, ReasoningPort
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.system import ClockPort, IdGeneratorPort
from ci_agent.application.services.notification_service import NotificationService
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus

_PRE_LEARNING = (ImprovementStatus.REJECTED, ImprovementStatus.EXPIRED, ImprovementStatus.DISMISSED)


def decision_label(prior_status: ImprovementStatus, imp: Improvement, failed: bool) -> str:
    """Summarise how the improvement ended. `prior_status` is the status before learning began."""
    if prior_status is ImprovementStatus.REJECTED:
        return "rejected"
    if prior_status is ImprovementStatus.EXPIRED:
        return "expired"
    if prior_status is ImprovementStatus.DISMISSED:
        return "dismissed"
    strategy = imp.directive.strategy if imp.directive else "unknown"
    return f"approved:{strategy}:failed" if failed else f"approved:{strategy}"


class LearnFromImprovement:
    def __init__(self, repo: ImprovementRepository, case_memory: CaseMemoryPort, reasoner: ReasoningPort,
                 recorder: Recorder, notifier: NotificationService, clock: ClockPort, ids: IdGeneratorPort) -> None:
        self._repo, self._cases, self._reasoner = repo, case_memory, reasoner
        self._recorder, self._notifier, self._clock, self._ids = recorder, notifier, clock, ids

    def execute(self, improvement_id: str) -> str:
        imp = self._repo.get(improvement_id)
        if imp is None:
            raise NotFoundError(improvement_id)
        now = self._clock.now()
        prior_status = imp.status
        if prior_status in _PRE_LEARNING:
            imp.begin_learning(now)
        failed = imp.measurement is None and imp.plan is not None and imp.directive is not None
        decision = decision_label(prior_status, imp, failed)
        verdict = imp.measurement.verdict.value if imp.measurement else None
        kpis = {d.name: d.improvement_pct for d in imp.measurement.deltas} if imp.measurement else {}
        lessons = self._reasoner.extract_lessons(LessonInput(imp.signal.kind, decision, verdict, kpis,
                                                             tuple(imp.human_notes)))
        situation = imp.signal.summary
        if imp.finding:
            situation += " | " + "; ".join(c.description for c in imp.finding.causes)
        case = CaseRecord(
            id=self._ids.new_id(), improvement_id=imp.id, signal_kind=imp.signal.kind, situation=situation,
            options_considered=tuple(o.strategy for o in imp.finding.options) if imp.finding else (),
            decision=decision, outcome_verdict=verdict, kpi_summary=kpis, lessons=tuple(lessons),
            created_at=now, tags=(imp.signal.kind, decision.split(":")[0]))
        self._cases.add(case)
        imp.close(case.id, now)
        self._recorder.commit(imp, "agent", "learned", {"case_id": case.id, "decision": decision})
        self._notifier.case_learned(imp)
        return case.id
