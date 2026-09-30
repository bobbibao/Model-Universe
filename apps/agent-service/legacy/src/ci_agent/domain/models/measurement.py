"""Measure phase results."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Verdict(str, Enum):
    SUCCESS = "success"
    INCONCLUSIVE = "inconclusive"
    NEGATIVE = "negative"


@dataclass(frozen=True)
class KpiDelta:
    name: str
    baseline: float
    current: float
    delta_pct: float  # signed change, (current - baseline) / |baseline| * 100
    improved: bool
    improvement_pct: float  # positive when better, negative when worse


@dataclass(frozen=True)
class MeasurementResult:
    deltas: tuple[KpiDelta, ...]
    verdict: Verdict
    measured_at: datetime
    summary: str
