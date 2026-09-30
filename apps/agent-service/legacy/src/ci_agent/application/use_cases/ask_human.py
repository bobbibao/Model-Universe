"""Phase 3 - Ask: turn the finding into a decision request and send it to the right approvers.

Under the AUTO_LOW_RISK autonomy policy, low-risk options are approved by the agent itself
(still recorded, audited and notified). Everything else waits for a human.
"""
from __future__ import annotations

from datetime import timedelta

from ci_agent.application.errors import NotFoundError
from ci_agent.application.ports.reasoning import ReasoningPort
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.system import ClockPort, IdGeneratorPort
from ci_agent.application.services.notification_service import NotificationService
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.models.human import Answer, AnswerDecision, Question
from ci_agent.domain.policies.approval import ApproverPolicy
from ci_agent.domain.policies.autonomy import AutonomyPolicy
from ci_agent.domain.services.directive_factory import build_directive
from ci_agent.domain.strategies.registry import get_strategy


class AskHuman:
    def __init__(self, repo: ImprovementRepository, reasoner: ReasoningPort, notifier: NotificationService,
                 recorder: Recorder, clock: ClockPort, ids: IdGeneratorPort, approver_policy: ApproverPolicy,
                 autonomy: AutonomyPolicy, question_ttl_hours: int = 48) -> None:
        self._repo, self._reasoner, self._notifier, self._recorder = repo, reasoner, notifier, recorder
        self._clock, self._ids, self._approvers, self._autonomy = clock, ids, approver_policy, autonomy
        self._ttl = timedelta(hours=question_ttl_hours)

    def execute(self, improvement_id: str, note: str | None = None) -> None:
        imp = self._repo.get(improvement_id)
        if imp is None or imp.finding is None:
            raise NotFoundError(improvement_id)
        now = self._clock.now()
        finding = imp.finding
        text = self._reasoner.compose_question(imp.signal, finding, note)
        question = Question(id=self._ids.new_id(), improvement_id=imp.id, prompt=text.prompt,
                            context=text.context, options=finding.options, created_at=now,
                            expires_at=now + self._ttl, attempt=len(imp.questions) + 1,
                            recommended_option_id=finding.options[0].option_id)
        imp.open_question(question, now)

        top = finding.options[0]
        if self._autonomy.can_auto_approve(top, imp.signal.severity):
            answer = Answer(question.id, AnswerDecision.APPROVE, "system:auto", "system", now, top.option_id)
            directive = build_directive(get_strategy(top.strategy), top, {}, imp.signal.subject_skus,
                                        "system:auto", now, auto_approved=True)
            imp.record_answer(answer, directive, now)
            self._recorder.commit(imp, "agent", "auto_approved", {"option": top.option_id})
            self._notifier.auto_approved(imp, directive)
            return

        minimum_role = self._approvers.minimum_role(finding.options)
        notified = self._notifier.question(imp, question, minimum_role)
        self._recorder.commit(imp, "agent", "asked_human",
                              {"question_id": question.id, "recipients": notified, "attempt": question.attempt})
