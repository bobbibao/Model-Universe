"""Close decision requests that nobody answered in time."""
from __future__ import annotations

from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.notification_service import NotificationService
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.models.improvement import ImprovementStatus


class ExpireStaleQuestions:
    def __init__(self, repo: ImprovementRepository, recorder: Recorder, notifier: NotificationService,
                 clock: ClockPort) -> None:
        self._repo, self._recorder, self._notifier, self._clock = repo, recorder, notifier, clock

    def execute(self) -> list[str]:
        expired: list[str] = []
        now = self._clock.now()
        for imp in self._repo.list_by_status([ImprovementStatus.AWAITING_HUMAN]):
            if imp.expire_question_if_due(now):
                self._recorder.commit(imp, "agent", "question_expired")
                self._notifier.question_expired(imp)
                expired.append(imp.id)
        return expired
