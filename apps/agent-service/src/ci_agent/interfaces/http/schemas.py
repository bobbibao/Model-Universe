"""Pydantic DTOs for the HTTP boundary. The domain never imports these, and these never leak
into the domain (mapping happens in the routers)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

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


class CauseOut(BaseModel):
    description: str
    confidence: float


class FindingOut(BaseModel):
    summary: str
    causes: list[CauseOut]
    sop_refs: list[str]
    similar_case_ids: list[str]
    actionable: bool
    confidence: float


class QuestionOut(BaseModel):
    id: str
    prompt: str
    context: str
    status: str
    attempt: int
    created_at: datetime
    expires_at: datetime
    recommended_option_id: str | None = None


class AnswerOut(BaseModel):
    question_id: str
    decision: str
    answered_by: str
    channel: str
    answered_at: datetime
    option_id: str | None = None
    note: str | None = None


class HistoryOut(BaseModel):
    status: str
    at: datetime
    note: str


class PlannedActionOut(BaseModel):
    type: str
    params: dict[str, Any]
    description: str


class PlanOut(BaseModel):
    strategy: str
    plan_hash: str
    estimated_cost: float
    evaluate_after_days: int
    actions: list[PlannedActionOut]


class ActionRecordOut(BaseModel):
    step: int
    type: str
    status: str
    detail: str
    executed_at: datetime | None = None


class MeasurementOut(BaseModel):
    verdict: str
    summary: str
    measured_at: datetime
    deltas: list[dict[str, Any]]


class ImprovementDetailOut(ImprovementOut):
    """Everything the web console's detail page shows; the list endpoint keeps the smaller ImprovementOut."""

    subject_skus: list[str]
    metrics: dict[str, float]
    finding: FindingOut | None = None
    question: QuestionOut | None = None  # the open question, else the latest one
    answers: list[AnswerOut] = []
    history: list[HistoryOut] = []
    plan: PlanOut | None = None
    action_records: list[ActionRecordOut] = []
    measure_due_at: datetime | None = None
    measurement: MeasurementOut | None = None
    case_id: str | None = None


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject", "clarify"]
    option_id: str | None = None
    overrides: dict[str, Any] = {}
    note: str | None = None


class KpiImpactOut(BaseModel):
    improvement_id: str
    verdict: str
    summary: str
    deltas: list[dict[str, Any]]
