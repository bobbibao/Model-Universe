"""What the LLM may return: one structured-output schema per ReasoningPort method.

Deliberately absent: `actionable` (the rules decide whether there is anything to ask about, so an LLM can never
dismiss an improvement), any amount, price or quantity field, and anything that names an action.

Length limits are a generous hard ceiling on output tokens, not the target length: Ollama enforces them in its
grammar by cutting the string mid-sentence, so the prompts ask for much less (output length is most of the latency
on a local model).
"""
from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CauseOut(_Strict):
    text: str = Field(min_length=10, max_length=400)
    confidence: float = Field(ge=0, le=1)


class InvestigationOut(_Strict):
    causes: list[CauseOut] = Field(min_length=1, max_length=3)
    sop_refs: list[str] = Field(max_length=3)
    confidence: float = Field(ge=0, le=1)


class QuestionOut(_Strict):
    prompt: str = Field(min_length=20, max_length=900)


class LessonsOut(_Strict):
    lessons: list[Annotated[str, Field(min_length=10, max_length=400)]] = Field(min_length=1, max_length=3)
