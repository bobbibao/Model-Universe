"""Phase 3 (continued) - accept a human's answer from any channel (web, Telegram, Zalo, email link)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ci_agent.application.errors import ConflictError, NotFoundError, UnauthorizedError, ValidationFailed
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.errors import DomainError, RuleViolation
from ci_agent.domain.models.human import Answer, AnswerDecision
from ci_agent.domain.models.improvement import Improvement
from ci_agent.domain.models.notification import Role, role_at_least
from ci_agent.domain.policies.approval import ApproverPolicy
from ci_agent.domain.services.directive_factory import build_directive, merge_params
from ci_agent.domain.strategies.registry import get_strategy


@dataclass(frozen=True)
class Actor:
    """Who is answering. Interfaces resolve this from a web session, Telegram identity or signed link."""

    user_id: str
    role: Role
    channel: str


@dataclass(frozen=True)
class SubmitAnswerCommand:
    question_id: str
    decision: AnswerDecision
    actor: Actor
    option_id: str | None = None
    overrides: dict[str, Any] = field(default_factory=dict)
    note: str | None = None


class SubmitAnswer:
    def __init__(self, repo: ImprovementRepository, recorder: Recorder, clock: ClockPort,
                 approver_policy: ApproverPolicy) -> None:
        self._repo, self._recorder, self._clock, self._policy = repo, recorder, clock, approver_policy

    def execute(self, cmd: SubmitAnswerCommand) -> Improvement:
        imp = self._repo.find_by_question_id(cmd.question_id)
        if imp is None:
            raise NotFoundError(f"question {cmd.question_id}")
        question = imp.current_question
        if question is None or question.id != cmd.question_id:
            raise ConflictError("This question is no longer open")
        now = self._clock.now()

        directive = None
        if cmd.decision is AnswerDecision.APPROVE:
            option = next((o for o in question.options if o.option_id == cmd.option_id), None)
            if option is None:
                raise ValidationFailed(f"Unknown option {cmd.option_id!r}")
            try:
                params = merge_params(option, cmd.overrides)
                required = self._policy.required_role(option.strategy, params, option.est_cost)
                self._authorize(cmd.actor, required)
                directive = build_directive(get_strategy(option.strategy), option, cmd.overrides,
                                            imp.signal.subject_skus, f"user:{cmd.actor.user_id}", now)
            except RuleViolation as exc:
                raise ValidationFailed(str(exc)) from exc
        else:
            self._authorize(cmd.actor, self._policy.minimum_role(question.options))

        answer = Answer(question.id, cmd.decision, f"user:{cmd.actor.user_id}", cmd.actor.channel, now,
                        cmd.option_id, dict(cmd.overrides), cmd.note)
        try:
            imp.record_answer(answer, directive, now)
        except DomainError as exc:
            raise ConflictError(str(exc)) from exc
        self._recorder.commit(imp, f"user:{cmd.actor.user_id}", "answered",
                              {"decision": cmd.decision.value, "option": cmd.option_id, "channel": cmd.actor.channel})
        return imp

    @staticmethod
    def _authorize(actor: Actor, required: Role) -> None:
        if not role_at_least(actor.role, required):
            raise UnauthorizedError(f"Role {actor.role.value!r} cannot approve this; {required.value!r} required")
