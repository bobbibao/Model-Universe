"""LangGraphReasoner: LLM-backed ReasoningPort (TO IMPLEMENT - see docs/ROADMAP.md T-01).

Design constraints (do not relax them):
1. Use LangGraph as an *implementation detail* of this adapter: a small tool-calling agent per method.
2. Tools are READ-ONLY (query stock, returns, SOP search, similar cases). There is no write tool.
3. `investigate` returns a FindingDraft (causes, sop_refs, actionable, confidence). It never returns
   numbers that drive money or stock decisions; strategies compute those deterministically.
4. Validate LLM output against the dataclasses; on invalid output or LLM failure, fall back to
   RuleBasedReasoner so the loop keeps working.
5. Prompts live in infrastructure/reasoning/prompts/*.md.
Build the model with llm_factory.get_llm().
"""
from __future__ import annotations

from ci_agent.application.ports.reasoning import FindingDraft, InvestigationContext, LessonInput, QuestionText
from ci_agent.domain.models.finding import Finding
from ci_agent.domain.models.signal import Signal


class LangGraphReasoner:
    def investigate(self, ctx: InvestigationContext) -> FindingDraft:
        raise NotImplementedError("ROADMAP T-01")

    def compose_question(self, signal: Signal, finding: Finding, note: str | None = None) -> QuestionText:
        raise NotImplementedError("ROADMAP T-01")

    def extract_lessons(self, lesson_input: LessonInput) -> list[str]:
        raise NotImplementedError("ROADMAP T-01")
