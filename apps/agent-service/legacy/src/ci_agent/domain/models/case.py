"""Learn phase: CaseRecord is the unit of institutional knowledge."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class CaseRecord:
    id: str
    improvement_id: str
    signal_kind: str
    situation: str
    options_considered: tuple[str, ...]
    decision: str  # approved:<strategy> | rejected | expired | dismissed | approved:<strategy>:failed
    outcome_verdict: str | None  # success | inconclusive | negative | None when nothing was executed
    kpi_summary: dict[str, float]
    lessons: tuple[str, ...]
    created_at: datetime
    tags: tuple[str, ...] = field(default_factory=tuple)

    @property
    def strategy(self) -> str | None:
        parts = self.decision.split(":")
        return parts[1] if len(parts) > 1 and parts[0] == "approved" else None
