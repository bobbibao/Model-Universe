"""Persist an aggregate, append an audit entry and publish its domain events, in one place."""
from __future__ import annotations

from typing import Any

from ci_agent.application.ports.events import EventPublisherPort
from ci_agent.application.ports.repositories import AuditLogPort, ImprovementRepository
from ci_agent.application.ports.system import ClockPort
from ci_agent.domain.models.audit import AuditEntry
from ci_agent.domain.models.improvement import Improvement


class Recorder:
    def __init__(self, repo: ImprovementRepository, audit: AuditLogPort, publisher: EventPublisherPort,
                 clock: ClockPort) -> None:
        self._repo, self._audit, self._publisher, self._clock = repo, audit, publisher, clock

    def add(self, imp: Improvement, actor: str, action: str, detail: dict[str, Any] | None = None) -> None:
        self._repo.add(imp)
        self._after(imp, actor, action, detail)

    def commit(self, imp: Improvement, actor: str, action: str, detail: dict[str, Any] | None = None) -> None:
        self._repo.save(imp)
        self._after(imp, actor, action, detail)

    def log(self, actor: str, action: str, improvement_id: str | None = None,
            detail: dict[str, Any] | None = None) -> None:
        self._audit.append(AuditEntry(actor, action, self._clock.now(), improvement_id, detail or {}))

    def _after(self, imp: Improvement, actor: str, action: str, detail: dict[str, Any] | None) -> None:
        self.log(actor, action, imp.id, detail)
        events = imp.pull_events()
        if events:
            self._publisher.publish(events)
