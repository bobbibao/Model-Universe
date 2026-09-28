from __future__ import annotations

from typing import Protocol, Sequence

from ci_agent.domain.events import DomainEvent


class EventPublisherPort(Protocol):
    def publish(self, events: Sequence[DomainEvent]) -> None:
        """Deliver events to the web app (status changes, notifications, measurements, audit)."""
