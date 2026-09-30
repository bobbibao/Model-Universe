"""Chooses recipients per notification kind and hands them to the dispatcher."""
from __future__ import annotations

from typing import Callable

from ci_agent.application.ports.notifications import RecipientDirectoryPort
from ci_agent.application.services.notification_dispatcher import NotificationDispatcher
from ci_agent.application.services.notification_factory import NotificationFactory
from ci_agent.domain.models.human import Directive, Question
from ci_agent.domain.models.improvement import Improvement
from ci_agent.domain.models.notification import Notification, Recipient, Role


class NotificationService:
    def __init__(self, directory: RecipientDirectoryPort, dispatcher: NotificationDispatcher,
                 factory: NotificationFactory) -> None:
        self._directory, self._dispatcher, self._factory = directory, dispatcher, factory

    def _send(self, recipients: list[Recipient], build: Callable[[Recipient], Notification]) -> int:
        for r in recipients:
            self._dispatcher.notify(build(r), r)
        return len(recipients)

    def question(self, imp: Improvement, question: Question, minimum_role: Role) -> int:
        return self._send(self._directory.approvers_for(minimum_role),
                          lambda r: self._factory.question(imp, question, r))

    def auto_approved(self, imp: Improvement, directive: Directive) -> int:
        return self._send(self._directory.admins(), lambda r: self._factory.auto_approved(imp, directive, r))

    def action_executed(self, imp: Improvement) -> int:
        return self._send(self._directory.admins(), lambda r: self._factory.action_executed(imp, r))

    def action_failed(self, imp: Improvement, error: str) -> int:
        return self._send(self._directory.admins(), lambda r: self._factory.action_failed(imp, r, error))

    def measurement_ready(self, imp: Improvement) -> int:
        return self._send(self._directory.admins(), lambda r: self._factory.measurement_ready(imp, r))

    def question_expired(self, imp: Improvement) -> int:
        return self._send(self._directory.admins(), lambda r: self._factory.question_expired(imp, r))

    def case_learned(self, imp: Improvement) -> int:
        return self._send(self._directory.admins(), lambda r: self._factory.case_learned(imp, r))
