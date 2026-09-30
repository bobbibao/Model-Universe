"""Finding: output of the Investigate phase."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Cause:
    description: str
    confidence: float
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OptionPreview:
    """A candidate improvement with deterministic numbers. Shown to the human in Ask."""

    option_id: str
    strategy: str
    title: str
    params: dict[str, Any]
    est_recovery_value: float
    est_cost: float
    est_waste_reduction: float
    risk: str = "low"  # low | medium | high
    assumptions: tuple[str, ...] = ()

    @property
    def net_value(self) -> float:
        return self.est_recovery_value - self.est_cost


@dataclass(frozen=True)
class Finding:
    signal_id: str
    summary: str
    causes: tuple[Cause, ...]
    sop_refs: tuple[str, ...]
    similar_case_ids: tuple[str, ...]
    options: tuple[OptionPreview, ...]
    actionable: bool
    confidence: float
