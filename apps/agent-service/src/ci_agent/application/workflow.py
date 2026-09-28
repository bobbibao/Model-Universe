"""WorkflowCoordinator: advances improvements through Detect -> ... -> Learn.

The loop is a persisted state machine, not a paused process. Human waits (days) cost nothing:
`advance` runs automatic phases until it reaches a state that needs an outside event
(an answer, or the measurement date). A scheduler calls `tick`; interfaces call `submit_answer`.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ci_agent.application.errors import ApplicationError
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.recorder import Recorder
from ci_agent.application.use_cases.ask_human import AskHuman
from ci_agent.application.use_cases.detect_signals import DetectSignals
from ci_agent.application.use_cases.execute_plan import ExecutePlan
from ci_agent.application.use_cases.expire_questions import ExpireStaleQuestions
from ci_agent.application.use_cases.investigate import InvestigateImprovement
from ci_agent.application.use_cases.learn import LearnFromImprovement
from ci_agent.application.use_cases.measure_outcome import MeasureOutcome
from ci_agent.application.use_cases.plan_improvement import PlanImprovement
from ci_agent.application.use_cases.submit_answer import SubmitAnswer, SubmitAnswerCommand
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus

S = ImprovementStatus
_AUTOMATIC = (S.DETECTED, S.INVESTIGATING, S.APPROVED, S.PLANNED, S.ACT_FAILED, S.MEASURING,
              S.REJECTED, S.EXPIRED, S.DISMISSED, S.LEARNING)


@dataclass
class TickReport:
    detected: list[str] = field(default_factory=list)
    expired: list[str] = field(default_factory=list)
    advanced: dict[str, str] = field(default_factory=dict)  # improvement id -> resulting status
    errors: dict[str, str] = field(default_factory=dict)


class WorkflowCoordinator:
    def __init__(self, detect: DetectSignals, investigate: InvestigateImprovement, ask: AskHuman,
                 submit: SubmitAnswer, plan: PlanImprovement, act: ExecutePlan, measure: MeasureOutcome,
                 learn: LearnFromImprovement, expire: ExpireStaleQuestions, repo: ImprovementRepository,
                 recorder: Recorder, clock: ClockPort, max_questions: int = 3) -> None:
        self._detect, self._investigate, self._ask, self._submit = detect, investigate, ask, submit
        self._plan, self._act, self._measure, self._learn, self._expire = plan, act, measure, learn, expire
        self._repo, self._recorder, self._clock, self._max_questions = repo, recorder, clock, max_questions

    # ------------------------------------------------------------- entry points
    def tick(self) -> TickReport:
        report = TickReport()
        report.expired = self._expire.execute()
        report.detected = self._detect.execute()
        for imp in self._repo.list_by_status(_AUTOMATIC):
            try:
                report.advanced[imp.id] = self.advance(imp.id).value
            except ApplicationError as exc:  # one bad improvement must not stop the others
                report.errors[imp.id] = str(exc)
                self._recorder.log("agent", "advance_failed", imp.id, {"error": str(exc)})
            except Exception as exc:
                report.errors[imp.id] = f"{type(exc).__name__}: {exc}"
                self._recorder.log("agent", "advance_failed", imp.id, {"error": report.errors[imp.id]})
        return report

    def submit_answer(self, cmd: SubmitAnswerCommand) -> Improvement:
        imp = self._submit.execute(cmd)
        self.advance(imp.id)
        return self._repo.get(imp.id) or imp

    def advance(self, improvement_id: str, max_steps: int = 20) -> ImprovementStatus:
        """Run automatic phases until the improvement needs an outside event (or is closed)."""
        for _ in range(max_steps):
            before = self._signature(self._require(improvement_id))
            self._step(self._require(improvement_id))
            if self._signature(self._require(improvement_id)) == before:
                break
        return self._require(improvement_id).status

    # ---------------------------------------------------------------- internals
    def _require(self, improvement_id: str) -> Improvement:
        imp = self._repo.get(improvement_id)
        if imp is None:
            raise ApplicationError(f"Improvement {improvement_id} not found")
        return imp

    @staticmethod
    def _signature(imp: Improvement) -> tuple:
        return (len(imp.history), imp.finding is not None, imp.finding_stale, len(imp.questions))

    def _step(self, imp: Improvement) -> None:
        s, now = imp.status, self._clock.now()
        if s in (S.DETECTED,) or (s is S.INVESTIGATING and (imp.finding is None or imp.finding_stale)):
            self._investigate.execute(imp.id)
        elif s is S.INVESTIGATING:
            self._ask.execute(imp.id)
        elif s is S.APPROVED:
            result = self._plan.execute(imp.id)
            if not result.planned:
                if len(imp.questions) >= self._max_questions:
                    imp.abandon("plan could not satisfy the guardrails: " + "; ".join(result.violations), now)
                    self._recorder.commit(imp, "agent", "abandoned", {"violations": list(result.violations)})
                else:
                    self._ask.execute(imp.id, note="The plan violated guardrails: " + "; ".join(result.violations))
        elif s in (S.PLANNED, S.ACT_FAILED):
            self._act.execute(imp.id)
        elif s is S.MEASURING:
            self._measure.execute(imp.id)
        elif s in (S.REJECTED, S.EXPIRED, S.DISMISSED, S.LEARNING):
            self._learn.execute(imp.id)
        # AWAITING_HUMAN, ACTING, ACTED, CLOSED: nothing to do automatically
