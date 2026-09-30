"""Domain events. Use cases publish them after persisting the aggregate."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class DomainEvent:
    type: str  # e.g. "improvement.status_changed"
    improvement_id: str
    occurred_at: datetime
    payload: dict[str, Any] = field(default_factory=dict)
