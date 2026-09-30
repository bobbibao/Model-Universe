"""ReasoningPort: the only place an LLM (or rules) is used.

The reasoner never produces numbers that drive money or stock decisions and has
no write tools. Deterministic strategies compute the options.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from ci_agent.domain.models.case import CaseRecord
from ci_agent.domain.models.finding import Cause, Finding
from ci_agent.domain.models.shop import ReturnRecord, StockItem
from ci_agent.domain.models.signal import Signal
from ci_agent.application.ports.knowledge import SopSnippet


@dataclass(frozen=True)
class InvestigationContext:
    signal: Signal
    items: tuple[StockItem, ...]
    returns: tuple[ReturnRecord, ...]
    velocity: dict[str, float]
    sop: tuple[SopSnippet, ...]
    similar_cases: tuple[CaseRecord, ...]
    human_notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class FindingDraft:
    summary: str
    causes: tuple[Cause, ...]
    sop_refs: tuple[str, ...]
    actionable: bool
    confidence: float


@dataclass(frozen=True)
class QuestionText:
    prompt: str
    context: str


@dataclass(frozen=True)
class LessonInput:
    signal_kind: str
    decision: str
    outcome_verdict: str | None
    kpi_summary: dict[str, float]
    human_notes: tuple[str, ...] = field(default_factory=tuple)


class ReasoningPort(Protocol):
    def investigate(self, ctx: InvestigationContext) -> FindingDraft: ...

    def compose_question(self, signal: Signal, finding: Finding, note: str | None = None) -> QuestionText: ...

    def extract_lessons(self, lesson_input: LessonInput) -> list[str]: ...
