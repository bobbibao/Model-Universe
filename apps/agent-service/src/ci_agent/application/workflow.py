"""WorkflowCoordinator: advances improvements through Detect -> ... -> Learn.

The loop is a persisted state machine, not a paused process. Human waits (days) cost nothing:
`advance` runs automatic phases until it reaches a state that needs an outside event
(an answer, or the measurement date). A scheduler calls `tick`; interfaces call `submit_answer`.
"""
from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from ci_agent.application.errors import ApplicationError, ConflictError, ImprovementBusy
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
from ci_agent.application.use_cases.submit_answer import (
    SubmitAnswer,
    SubmitAnswerCommand,
)
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus

# Optional observer of a tick (e.g. a progress stream): (event, data). Never affects the tick.
ProgressCallback = Callable[[str, dict[str, Any]], None]

class _Claims:
    """Improvements being advanced right now, so two runners (a scheduled tick and a web decision) never run the same
    improvement's phases at once. Per process: the agent runs as one process (docs/ROADMAP.md T-09)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ids: set[str] = set()

    @contextmanager
    def claim(self, improvement_id: str) -> Iterator[bool]:
        with self._lock:
            claimed = improvement_id not in self._ids
            self._ids.add(improvement_id)
        try:
            yield claimed
        finally:
            if claimed:
                with self._lock:
                    self._ids.discard(improvement_id)


S = ImprovementStatus
_AUTOMATIC = (S.DETECTED, S.INVESTIGATING, S.APPROVED, S.PLANNED, S.ACT_FAILED, S.MEASURING,
              S.REJECTED, S.EXPIRED, S.DISMISSED, S.LEARNING)


@dataclass
class TickReport:
    detected: list[str] = field(default_factory=list)
    expired: list[str] = field(default_factory=list)
    advanced: dict[str, str] = field(default_factory=dict)  # improvement id -> resulting status
    errors: dict[str, str] = field(default_factory=dict)
    skipped: list[str] = field(default_factory=list)  # being advanced by another run at that moment (next run)


class WorkflowCoordinator:
    def __init__(self, detect: DetectSignals, investigate: InvestigateImprovement, ask: AskHuman,
                 submit: SubmitAnswer, plan: PlanImprovement, act: ExecutePlan, measure: MeasureOutcome,
                 learn: LearnFromImprovement, expire: ExpireStaleQuestions, repo: ImprovementRepository,
                 recorder: Recorder, clock: ClockPort, max_questions: int = 3) -> None:
        self._detect, self._investigate, self._ask, self._submit = detect, investigate, ask, submit
        self._plan, self._act, self._measure, self._learn, self._expire = plan, act, measure, learn, expire
        self._repo, self._recorder, self._clock, self._max_questions = repo, recorder, clock, max_questions
        self._claims = _Claims()

    # ------------------------------------------------------------- entry points
    def tick(self, progress: ProgressCallback | None = None) -> TickReport:
        report = TickReport()
        report.expired = self._expire.execute()
        report.detected = self._detect.execute()
        todo = self._repo.list_by_status(_AUTOMATIC)
        _notify(progress, "detected", {"expired": len(report.expired), "detected": len(report.detected),
                                       "to_advance": len(todo)})
        for done, imp in enumerate(todo, start=1):
            try:
                report.advanced[imp.id] = self.advance(imp.id).value
            except ImprovementBusy:  # a web decision is advancing it right now; the next run picks it up
                report.skipped.append(imp.id)
            except ApplicationError as exc:  # one bad improvement must not stop the others
                report.errors[imp.id] = str(exc)
                self._recorder.log("agent", "advance_failed", imp.id, {"error": str(exc)})
            except Exception as exc:
                report.errors[imp.id] = f"{type(exc).__name__}: {exc}"
                self._recorder.log("agent", "advance_failed", imp.id, {"error": report.errors[imp.id]})
            _notify(progress, "advanced", {"improvement_id": imp.id, "done": done, "total": len(todo),
                                           "status": report.advanced.get(imp.id), "error": report.errors.get(imp.id),
                                           "skipped": imp.id in report.skipped})
        return report

    def submit_answer(self, cmd: SubmitAnswerCommand) -> Improvement:
        imp = self._submit.execute(cmd)  # a closed question is still a ConflictError for the caller
        try:
            self.advance(imp.id)
        except ConflictError:
            # The answer is saved. Another run (e.g. the scheduler) is advancing this improvement right now, or saved
            # first; it continues from the saved answer, so this is not the caller's error.
            pass
        return self._repo.get(imp.id) or imp

    def advance(self, improvement_id: str, max_steps: int = 20) -> ImprovementStatus:
        """Run automatic phases until the improvement needs an outside event (or is closed).

        Raises ImprovementBusy when another runner in this process is advancing the same improvement.
        """
        with self._claims.claim(improvement_id) as claimed:
            if not claimed:
                raise ImprovementBusy(f"Improvement {improvement_id} is being advanced by another run")
            return self._advance(improvement_id, max_steps)

    def _advance(self, improvement_id: str, max_steps: int) -> ImprovementStatus:
        for _ in range(max_steps):
            current = self._require(improvement_id)
            before = self._signature(current)
            self._step(current)
            after = self._require(improvement_id)
            if self._signature(after) == before:
                break
            if after.action_attempts > current.action_attempts and self._act.retry_pending(after):
                # At most one Act attempt per call; the next attempt runs on a later run, not seconds later: a short
                # outage of the web app must not use up the attempts and abandon an approved plan. The failed
                # attempt was compensated; the next one gets new idempotency keys (next attempt number) and skips
                # steps whose compensation failed (still SUCCEEDED).
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


def _notify(progress: ProgressCallback | None, event: str, data: dict[str, Any]) -> None:
    if progress is None:
        return
    try:
        progress(event, data)
    except Exception:  # noqa: BLE001, S110 - an observer (e.g. a closed progress stream) must never break a tick
        pass
