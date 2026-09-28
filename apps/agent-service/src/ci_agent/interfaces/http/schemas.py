"""Pydantic DTOs for the HTTP boundary. The domain never imports these, and these never leak
into the domain (mapping happens in the routers)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class OptionOut(BaseModel):
    option_id: str
    strategy: str
    title: str
    params: dict[str, Any]
    est_recovery_value: float
    est_cost: float
    est_waste_reduction: float
    risk: str


class ImprovementOut(BaseModel):
    id: str
    status: str
    phase: str
    signal_kind: str
    summary: str
    severity: str
    created_at: datetime
    updated_at: datetime
    options: list[OptionOut] = []
    question_id: str | None = None


class DecisionIn(BaseModel):
    decision: str  # approve | reject | clarify
    option_id: str | None = None
    overrides: dict[str, Any] = {}
    note: str | None = None


class KpiImpactOut(BaseModel):
    improvement_id: str
    verdict: str
    summary: str
    deltas: list[dict[str, Any]]
