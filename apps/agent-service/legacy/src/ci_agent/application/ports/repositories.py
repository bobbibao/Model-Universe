from __future__ import annotations

from datetime import datetime
from typing import Protocol, Sequence

from ci_agent.domain.models.audit import AuditEntry
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.domain.models.notification import DeliveryAttempt


class ImprovementRepository(Protocol):
    def add(self, improvement: Improvement) -> None: ...

    def save(self, improvement: Improvement) -> None:
        """Persist changes. Implementations must raise ConflictError on a stale version."""

    def get(self, improvement_id: str) -> Improvement | None: ...

    def find_by_question_id(self, question_id: str) -> Improvement | None: ...

    def list_by_status(self, statuses: Sequence[ImprovementStatus]) -> list[Improvement]: ...

    def list_recent(self, limit: int = 50) -> list[Improvement]: ...

    def find_by_fingerprint_since(self, fingerprint: str, since: datetime) -> Improvement | None:
        """Any improvement with this fingerprint that is still open or was updated since `since`."""


class AuditLogPort(Protocol):
    def append(self, entry: AuditEntry) -> None: ...

    def list(self, improvement_id: str | None = None, limit: int = 100) -> list[AuditEntry]: ...


class NotificationLogPort(Protocol):
    def record(self, attempt: DeliveryAttempt) -> None: ...

    def list_for(self, notification_id: str) -> list[DeliveryAttempt]: ...

    def list_recent(self, limit: int = 100) -> list[DeliveryAttempt]: ...
