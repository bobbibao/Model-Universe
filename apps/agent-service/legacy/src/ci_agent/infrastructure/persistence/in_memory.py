"""In-memory adapters: used by tests, the simulator and local development.

They deep-copy on the way in and out to mimic a real database (no shared mutable state).
Every port here has a contract test that a Postgres adapter must also pass.
"""
from __future__ import annotations

import copy
from datetime import datetime
from typing import Sequence

from ci_agent.application.errors import ConflictError
from ci_agent.domain.models.audit import AuditEntry
from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.improvement import Improvement, ImprovementStatus
from ci_agent.domain.models.notification import DeliveryAttempt
from ci_agent.infrastructure.persistence.case_search import rank_similar


def _snapshot(improvement: Improvement) -> Improvement:
    """Stored copy without the transient pending events: the Recorder publishes them after saving (a Postgres
    adapter writes them to the outbox instead, T-07). Keeping them would republish them on every later save."""
    stored = copy.deepcopy(improvement)
    stored.pending_events = []
    return stored


class InMemoryImprovementRepository:
    def __init__(self) -> None:
        self._items: dict[str, Improvement] = {}

    def add(self, improvement: Improvement) -> None:
        if improvement.id in self._items:
            raise ConflictError(f"Improvement {improvement.id} already exists")
        self._items[improvement.id] = _snapshot(improvement)

    def save(self, improvement: Improvement) -> None:
        stored = self._items.get(improvement.id)
        if stored is None:
            raise ConflictError(f"Improvement {improvement.id} does not exist")
        if stored.version != improvement.version:
            raise ConflictError("Improvement was modified concurrently")
        improvement.version += 1
        self._items[improvement.id] = _snapshot(improvement)

    def get(self, improvement_id: str) -> Improvement | None:
        item = self._items.get(improvement_id)
        return copy.deepcopy(item) if item else None

    def find_by_question_id(self, question_id: str) -> Improvement | None:
        for item in self._items.values():
            if any(q.id == question_id for q in item.questions):
                return copy.deepcopy(item)
        return None

    def list_by_status(self, statuses: Sequence[ImprovementStatus]) -> list[Improvement]:
        wanted = set(statuses)
        return [copy.deepcopy(i) for i in self._items.values() if i.status in wanted]

    def list_recent(self, limit: int = 50) -> list[Improvement]:
        ordered = sorted(self._items.values(), key=lambda i: i.updated_at, reverse=True)
        return [copy.deepcopy(i) for i in ordered[:limit]]

    def find_by_fingerprint_since(self, fingerprint: str, since: datetime) -> Improvement | None:
        for item in self._items.values():
            if item.signal.fingerprint != fingerprint:
                continue
            if item.status is not ImprovementStatus.CLOSED or item.updated_at >= since:
                return copy.deepcopy(item)
        return None


class InMemoryCaseMemory:
    def __init__(self) -> None:
        self._cases: list[CaseRecord] = []

    def add(self, case: CaseRecord) -> None:
        self._cases.append(case)

    def list_recent(self, limit: int = 50) -> list[CaseRecord]:
        return list(reversed(self._cases))[:limit]

    def search_similar(self, text: str, signal_kind: str | None = None, limit: int = 3) -> list[CaseRecord]:
        return rank_similar(self._cases, text, signal_kind, limit)


class InMemoryAuditLog:
    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def append(self, entry: AuditEntry) -> None:
        self._entries.append(entry)

    def list(self, improvement_id: str | None = None, limit: int = 100) -> list[AuditEntry]:
        entries = [e for e in self._entries if improvement_id is None or e.improvement_id == improvement_id]
        return entries[-limit:]


class InMemoryNotificationLog:
    def __init__(self) -> None:
        self._attempts: list[DeliveryAttempt] = []

    def record(self, attempt: DeliveryAttempt) -> None:
        self._attempts.append(attempt)

    def list_for(self, notification_id: str) -> list[DeliveryAttempt]:
        return [a for a in self._attempts if a.notification_id == notification_id]

    def list_recent(self, limit: int = 100) -> list[DeliveryAttempt]:
        return self._attempts[-limit:]
