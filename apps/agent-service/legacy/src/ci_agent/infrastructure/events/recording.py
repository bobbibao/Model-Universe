from __future__ import annotations

from typing import Sequence

from ci_agent.domain.events import DomainEvent


class RecordingEventPublisher:
    """Collects events in memory (tests, simulator)."""

    def __init__(self) -> None:
        self.events: list[DomainEvent] = []

    def publish(self, events: Sequence[DomainEvent]) -> None:
        self.events.extend(events)

    def of_type(self, type_: str) -> list[DomainEvent]:
        return [e for e in self.events if e.type == type_]
