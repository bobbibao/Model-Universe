"""Append-only audit entries."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class AuditEntry:
    actor: str  # "system", "user:<id>", "agent"
    action: str
    at: datetime
    improvement_id: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)
