"""Improvement: the aggregate root that carries one issue through the whole loop.

Detect -> Investigate -> Ask -> Improve -> Act -> Measure -> Learn

All transition rules live here. The domain never reads the clock: every
method receives `now` from the caller.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from ci_agent.domain.errors import RuleViolation, InvalidTransition
from ci_agent.domain.events import DomainEvent
from ci_agent.domain.models.finding import Finding
from ci_agent.domain.models.human import Answer, AnswerDecision, Directive, Question, QuestionStatus
from ci_agent.domain.models.measurement import MeasurementResult
from ci_agent.domain.models.plan import ActionPlan, ActionRecord
from ci_agent.domain.models.signal import Signal


class ImprovementStatus(str, Enum):
    DETECTED = "detected"
    INVESTIGATING = "investigating"
    AWAITING_HUMAN = "awaiting_human"
    APPROVED = "approved"
    PLANNED = "planned"
    ACTING = "acting"
    ACT_FAILED = "act_failed"
    ACTED = "acted"
    MEASURING = "measuring"
    REJECTED = "rejected"
    EXPIRED = "expired"
    DISMISSED = "dismissed"
    LEARNING = "learning"
    CLOSED = "closed"


class Phase(str, Enum):
    DETECT = "detect"
    INVESTIGATE = "investigate"
    ASK = "ask"
    IMPROVE = "improve"
    ACT = "act"
    MEASURE = "measure"
    LEARN = "learn"


S = ImprovementStatus
_ALLOWED: dict[ImprovementStatus, set[ImprovementStatus]] = {
    S.DETECTED: {S.INVESTIGATING},
    S.INVESTIGATING: {S.AWAITING_HUMAN, S.DISMISSED},
    S.AWAITING_HUMAN: {S.APPROVED, S.REJECTED, S.EXPIRED, S.INVESTIGATING},
    S.APPROVED: {S.PLANNED, S.AWAITING_HUMAN, S.REJECTED},
    S.PLANNED: {S.ACTING},
    S.ACTING: {S.ACTED, S.ACT_FAILED},
    S.ACT_FAILED: {S.ACTING, S.LEARNING},
    S.ACTED: {S.MEASURING},
    S.MEASURING: {S.LEARNING},
    S.REJECTED: {S.LEARNING},
    S.EXPIRED: {S.LEARNING},
    S.DISMISSED: {S.LEARNING},
    S.LEARNING: {S.CLOSED},
    S.CLOSED: set(),
}

_PHASE_OF: dict[ImprovementStatus, Phase] = {
    S.DETECTED: Phase.DETECT,
    S.INVESTIGATING: Phase.INVESTIGATE,
    S.AWAITING_HUMAN: Phase.ASK,
    S.APPROVED: Phase.IMPROVE,
    S.PLANNED: Phase.IMPROVE,
    S.ACTING: Phase.ACT,
    S.ACT_FAILED: Phase.ACT,
    S.ACTED: Phase.ACT,
    S.MEASURING: Phase.MEASURE,
    S.REJECTED: Phase.LEARN,
    S.EXPIRED: Phase.LEARN,
    S.DISMISSED: Phase.LEARN,
    S.LEARNING: Phase.LEARN,
    S.CLOSED: Phase.LEARN,
}


@dataclass(frozen=True)
class HistoryEntry:
    status: ImprovementStatus
    at: datetime
    note: str = ""


@dataclass
class Improvement:
    id: str
    signal: Signal
    created_at: datetime
    updated_at: datetime
    status: ImprovementStatus = ImprovementStatus.DETECTED
    finding: Finding | None = None
    finding_stale: bool = False
    human_notes: list[str] = field(default_factory=list)
    questions: list[Question] = field(default_factory=list)
    answers: list[Answer] = field(default_factory=list)
    clarification_count: int = 0
    directive: Directive | None = None
    plan: ActionPlan | None = None
    action_records: list[ActionRecord] = field(default_factory=list)
    action_attempts: int = 0
    baseline: dict[str, float] = field(default_factory=dict)
    measure_due_at: datetime | None = None
    measurement: MeasurementResult | None = None
    case_id: str | None = None
    history: list[HistoryEntry] = field(default_factory=list)
    pending_events: list[DomainEvent] = field(default_factory=list)
    version: int = 0

    # ------------------------------------------------------------------ factory
    @classmethod
    def detect(cls, id: str, signal: Signal, now: datetime) -> "Improvement":
        imp = cls(id=id, signal=signal, created_at=now, updated_at=now)
        imp.history.append(HistoryEntry(S.DETECTED, now, "signal detected"))
        imp._emit("improvement.detected", now, kind=signal.kind, severity=signal.severity.value,
                  summary=signal.summary)
        return imp

    # --------------------------------------------------------------- properties
    @property
    def phase(self) -> Phase:
        return _PHASE_OF[self.status]

    @property
    def current_question(self) -> Question | None:
        for q in reversed(self.questions):
            if q.status is QuestionStatus.OPEN:
                return q
        return None

    def is_measurement_due(self, now: datetime) -> bool:
        return (self.status is S.MEASURING and self.measure_due_at is not None
                and now >= self.measure_due_at)

    def pull_events(self) -> list[DomainEvent]:
        events, self.pending_events = self.pending_events, []
        return events

    # ----------------------------------------------------------------- internals
    def _emit(self, type_: str, now: datetime, **payload: Any) -> None:
        self.pending_events.append(DomainEvent(type_, self.id, now, dict(payload)))

    def _move(self, to: ImprovementStatus, now: datetime, note: str = "") -> None:
        if to not in _ALLOWED[self.status]:
            raise InvalidTransition(f"{self.status.value} -> {to.value}")
        previous = self.status
        self.status = to
        self.updated_at = now
        self.history.append(HistoryEntry(to, now, note))
        self._emit("improvement.status_changed", now, **{"from": previous.value, "to": to.value,
                                                        "phase": self.phase.value, "note": note})

    def _require(self, *allowed: ImprovementStatus) -> None:
        if self.status not in allowed:
            names = ", ".join(s.value for s in allowed)
            raise InvalidTransition(f"Expected status in [{names}] but was {self.status.value}")

    # ------------------------------------------------------------- Investigate
    def start_investigation(self, now: datetime) -> None:
        self._require(S.DETECTED)
        self._move(S.INVESTIGATING, now)

    def record_finding(self, finding: Finding, now: datetime) -> None:
        self._require(S.INVESTIGATING)
        self.finding = finding
        self.finding_stale = False
        self.updated_at = now
        self._emit("finding.recorded", now, actionable=finding.actionable, options=len(finding.options))

    def dismiss(self, reason: str, now: datetime) -> None:
        self._require(S.INVESTIGATING)
        self._move(S.DISMISSED, now, reason)

    # -------------------------------------------------------------------- Ask
    def open_question(self, question: Question, now: datetime) -> None:
        self._require(S.INVESTIGATING, S.APPROVED)
        if self.finding is None or not self.finding.actionable:
            raise RuleViolation("Cannot ask a human about a non-actionable finding")
        if self.current_question is not None:
            raise RuleViolation("A question is already open")
        self.questions.append(question)
        self.directive = None
        self._move(S.AWAITING_HUMAN, now, f"question {question.id} opened")
        self._emit("question.opened", now, question_id=question.id, expires_at=question.expires_at.isoformat())

    def record_answer(self, answer: Answer, directive: Directive | None, now: datetime) -> None:
        self._require(S.AWAITING_HUMAN)
        question = self.current_question
        if question is None or question.id != answer.question_id:
            raise RuleViolation("Answer does not match the open question")
        if now >= question.expires_at:
            raise RuleViolation("Question has expired")
        question.status = QuestionStatus.ANSWERED
        self.answers.append(answer)
        self._emit("question.answered", now, question_id=question.id, decision=answer.decision.value,
                   answered_by=answer.answered_by, channel=answer.channel)
        if answer.decision is AnswerDecision.APPROVE:
            if directive is None:
                raise RuleViolation("An approving answer requires a directive")
            self.directive = directive
            self._move(S.APPROVED, now, f"approved by {answer.answered_by}")
        elif answer.decision is AnswerDecision.REJECT:
            self._move(S.REJECTED, now, answer.note or "rejected by human")
        else:  # CLARIFY: go back to Investigate with the human's note
            self.clarification_count += 1
            if answer.note:
                self.human_notes.append(answer.note)
            self.finding_stale = True
            self._move(S.INVESTIGATING, now, "human asked for more analysis")

    def expire_question_if_due(self, now: datetime) -> bool:
        if self.status is not S.AWAITING_HUMAN:
            return False
        question = self.current_question
        if question is None or now < question.expires_at:
            return False
        question.status = QuestionStatus.EXPIRED
        self._move(S.EXPIRED, now, "question expired without an answer")
        return True

    # ---------------------------------------------------------------- Improve
    def attach_plan(self, plan: ActionPlan, now: datetime) -> None:
        self._require(S.APPROVED)
        plan.verify()
        self.plan = plan
        self._move(S.PLANNED, now, f"plan {plan.plan_hash[:8]} ready")

    def abandon(self, reason: str, now: datetime) -> None:
        self._require(S.APPROVED)
        self._move(S.REJECTED, now, reason)

    # -------------------------------------------------------------------- Act
    def start_action(self, baseline: dict[str, float], now: datetime) -> None:
        self._require(S.PLANNED, S.ACT_FAILED)
        if self.plan is None:
            raise RuleViolation("No plan to execute")
        self.plan.verify()  # raises IntegrityError if the plan was tampered with
        if not self.baseline:
            self.baseline = dict(baseline)
        self.action_attempts += 1
        self._move(S.ACTING, now, f"attempt {self.action_attempts}")

    def record_actions(self, records: list[ActionRecord]) -> None:
        self.action_records = list(records)

    def mark_acted(self, now: datetime) -> None:
        self._require(S.ACTING)
        self._move(S.ACTED, now)
        self._emit("action.executed", now, steps=len(self.action_records))

    def start_measuring(self, due_at: datetime, now: datetime) -> None:
        self._require(S.ACTED)
        self.measure_due_at = due_at
        self._move(S.MEASURING, now, f"measure at {due_at.isoformat()}")

    def fail_action(self, reason: str, now: datetime) -> None:
        self._require(S.ACTING)
        self._move(S.ACT_FAILED, now, reason)
        self._emit("action.failed", now, reason=reason, attempt=self.action_attempts)

    def abandon_action(self, now: datetime) -> None:
        self._require(S.ACT_FAILED)
        self._move(S.LEARNING, now, "action abandoned after failures")

    # ---------------------------------------------------------------- Measure
    def record_measurement(self, result: MeasurementResult, now: datetime) -> None:
        self._require(S.MEASURING)
        self.measurement = result
        self._emit("measurement.completed", now, verdict=result.verdict.value, summary=result.summary)
        self._move(S.LEARNING, now, f"measured: {result.verdict.value}")

    # ------------------------------------------------------------------ Learn
    def begin_learning(self, now: datetime) -> None:
        self._require(S.REJECTED, S.EXPIRED, S.DISMISSED)
        self._move(S.LEARNING, now)

    def close(self, case_id: str, now: datetime) -> None:
        self._require(S.LEARNING)
        self.case_id = case_id
        self._move(S.CLOSED, now, f"case {case_id} stored")
        self._emit("case.learned", now, case_id=case_id)
