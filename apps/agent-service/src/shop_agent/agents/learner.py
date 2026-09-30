"""Learn: the worker model writes lessons from a finished improvement; the case goes to the Store.

The case text itself (what happened, the decision, the KPI changes) is assembled by code; the model only adds
lessons. Every outcome is learned from, including rejection, expiry, failure, shadow and "do nothing".
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from shop_agent import llm
from shop_agent.agents.investigator import language_name
from shop_agent.agents.middleware import role_middleware
from shop_agent.config import get_settings

LEARN_PROMPT = (Path(__file__).resolve().parent / "prompts" / "learn.md").read_text(encoding="utf-8")


class Lessons(BaseModel):
    lessons: list[str] = Field(description="1 to 3 lessons, one sentence each.")


def build_learner() -> Any:
    language = language_name(get_settings().agent_language)
    return create_agent(
        model=llm.chat_model(llm.ModelRole.WORKER),
        tools=[],
        system_prompt=LEARN_PROMPT.replace("{language}", language),
        response_format=Lessons,
        middleware=role_middleware(llm.ModelRole.WORKER, model_call_limit=3),
        name="learn",
        # Part of one node's execution: never checkpointed on its own, so a retried node investigates afresh
        # instead of resuming the finished inner run (only the node's result is checkpointed).
        checkpointer=False,
    )


async def write_lessons(case_text: str, *, script_key: str) -> list[str]:
    result = await build_learner().ainvoke(
        {"messages": [HumanMessage(f"<case>\n{case_text}\n</case>")]}, {"metadata": {"script_key": script_key}}
    )
    lessons = result.get("structured_response")
    if not isinstance(lessons, Lessons):
        raise RuntimeError("the learner returned no Lessons")
    return [lesson.strip() for lesson in lessons.lessons if lesson.strip()][:3]
