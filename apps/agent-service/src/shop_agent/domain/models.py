"""Opportunity: the output of Detect. One improvement thread is opened per opportunity fingerprint."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from enum import StrEnum
from hashlib import sha256

from pydantic import BaseModel, ConfigDict, Field


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


SEVERITY_RANK = {Severity.LOW: 1, Severity.MEDIUM: 2, Severity.HIGH: 3, Severity.CRITICAL: 4}


def make_fingerprint(kind: str, scope: Iterable[str], bucket: str = "") -> str:
    """kind + scope (+ period bucket): the same situation never opens two threads."""
    digest = sha256(",".join(sorted(scope)).encode("utf-8")).hexdigest()[:12]
    return f"{kind}:{digest}" + (f":{bucket}" if bucket else "")


class Opportunity(BaseModel):
    model_config = ConfigDict(frozen=True)

    kind: str
    fingerprint: str
    severity: Severity
    title: str
    summary: str
    evidence: dict[str, float | int | str] = Field(default_factory=dict)
    skus: tuple[str, ...] = ()
    detected_at: datetime
