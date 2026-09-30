"""Ask phase: Question, Answer and the Directive (bounded authority) it produces."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from ci_agent.domain.models.finding import OptionPreview


class QuestionStatus(str, Enum):
    OPEN = "open"
    ANSWERED = "answered"
    EXPIRED = "expired"


class AnswerDecision(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    CLARIFY = "clarify"  # human needs more analysis or supplies extra context


@dataclass
class Question:
    id: str
    improvement_id: str
    prompt: str
    context: str
    options: tuple[OptionPreview, ...]
    created_at: datetime
    expires_at: datetime
    attempt: int = 1
    recommended_option_id: str | None = None
    status: QuestionStatus = QuestionStatus.OPEN


@dataclass(frozen=True)
class Answer:
    question_id: str
    decision: AnswerDecision
    answered_by: str
    channel: str  # web | telegram | zalo | email | system
    answered_at: datetime
    option_id: str | None = None
    overrides: dict[str, Any] = field(default_factory=dict)
    note: str | None = None


@dataclass(frozen=True)
class Directive:
    """What the human authorised: a strategy, its parameters and hard limits.

    Improve may only produce a plan inside these limits; Act re-verifies.
    """

    strategy: str
    option_id: str
    params: dict[str, Any]
    limits: dict[str, Any]
    sku_scope: tuple[str, ...]
    approved_by: str
    approved_at: datetime
    auto_approved: bool = False
