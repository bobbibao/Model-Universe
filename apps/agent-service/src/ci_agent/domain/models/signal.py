"""Signal: output of the Detect phase."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from hashlib import sha256
from typing import Iterable


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


SEVERITY_RANK = {Severity.LOW: 1, Severity.MEDIUM: 2, Severity.HIGH: 3, Severity.CRITICAL: 4}


def make_fingerprint(kind: str, skus: Iterable[str]) -> str:
    digest = sha256(",".join(sorted(skus)).encode("utf-8")).hexdigest()[:12]
    return f"{kind}:{digest}"


@dataclass(frozen=True)
class Signal:
    kind: str  # dead_stock | high_returns | near_expiry | ...
    summary: str
    severity: Severity
    subject_skus: tuple[str, ...]
    detected_at: datetime
    fingerprint: str
    metrics: dict[str, float] = field(default_factory=dict)
    id: str = ""  # assigned by the DetectSignals use case
