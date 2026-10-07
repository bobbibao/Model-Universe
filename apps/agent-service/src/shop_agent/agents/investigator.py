"""Investigate: one read-only agent per opportunity kind that returns a structured `Proposal`.

The agent reads (metric, knowledge and estimator tools of its kind) and chooses among the strategies of the menu it
is given; it never computes money and has no write tool. `validate` recomputes every option from its strategy and
parameters, so figures the model writes are never shown or executed.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Literal

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from shop_agent import llm
from shop_agent.agents.kinds import KindSpec
from shop_agent.agents.middleware import role_middleware
from shop_agent.config import get_settings
from shop_agent.domain.models import Opportunity
from shop_agent.domain.options import OptionPlan

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
INVESTIGATE_PROMPT = (PROMPTS_DIR / "investigate.md").read_text(encoding="utf-8")
LANGUAGES = {"vi": "Vietnamese", "en": "English"}
PARAM_FIELDS = (
    "percent",
    "duration_days",
    "bundle_discount_pct",
    "anchor_sku",
    "skus",
    "min_order_vnd",
    "platform",
    "daily_budget_vnd",
    "message",
    "scheduled_at",
    "headline",
    "primary_text",
    "headlines",
    "descriptions",
    "keywords",
    "ad_text",
)


class Cause(BaseModel):
    text: str = Field(description="One sentence naming the facts it rests on.")
    confidence: float = Field(description="0 to 1; a guess the facts cannot confirm stays below 0.5.")


class OptionChoice(BaseModel):
    option_id: str = Field(description="Short id, e.g. the strategy name.")
    strategy: str = Field(description="A strategy name from the menu.")
    percent: float | None = Field(default=None, description="discount or coupon: percent off")
    duration_days: int | None = Field(default=None, description="discount, coupon or campaign: days")
    bundle_discount_pct: float | None = Field(default=None, description="bundle: percent off the bundle")
    anchor_sku: str | None = Field(default=None, description="bundle: the best seller to bundle with")
    # Growth levers: leave a field out to take the menu's default.
    skus: list[str] | None = Field(default=None, description="growth: a subset of the opportunity's SKUs to feature")
    min_order_vnd: int | None = Field(default=None, description="coupon: minimum order (VND)")
    platform: Literal["meta", "google", "tiktok"] | None = Field(default=None, description="ads: the platform")
    daily_budget_vnd: int | None = Field(default=None, description="ads: daily budget (VND), inside the limits")
    message: str | None = Field(default=None, description="post: the Facebook post text")
    scheduled_at: str | None = Field(default=None, description="post: ISO time to publish (default: now)")
    headline: str | None = Field(default=None, description="Meta ad: headline (<= 40 characters)")
    primary_text: str | None = Field(default=None, description="Meta ad: primary text")
    headlines: list[str] | None = Field(default=None, description="Google ad: 3-15 headlines (<= 30 characters)")
    descriptions: list[str] | None = Field(default=None, description="Google ad: 2-4 descriptions (<= 90 characters)")
    keywords: list[str] | None = Field(default=None, description="Google ad: search keywords")
    ad_text: str | None = Field(default=None, description="TikTok ad: text (<= 100 characters)")
    rationale: str = Field(description="Why this option, from the facts.")

    def params(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in PARAM_FIELDS if getattr(self, name) is not None}


class Proposal(BaseModel):
    summary: str
    causes: list[Cause]
    sop_refs: list[str] = Field(default_factory=list)
    options: list[OptionChoice]
    recommended_option_id: str
    confidence: float


def language_name(code: str) -> str:
    return LANGUAGES.get(code, code)


def system_prompt(spec: KindSpec) -> str:
    language = language_name(get_settings().agent_language)
    return INVESTIGATE_PROMPT.replace("{language}", language).replace("{playbook}", spec.playbook)


def build_investigator(spec: KindSpec) -> Any:
    return create_agent(
        model=llm.chat_model(llm.ModelRole.PLANNER),
        tools=spec.tools,
        system_prompt=system_prompt(spec),
        response_format=Proposal,
        middleware=role_middleware(llm.ModelRole.PLANNER),
        name=f"investigate_{spec.kind}",
        # Part of one node's execution: never checkpointed on its own, so a retried node investigates afresh
        # instead of resuming the finished inner run (only the node's result is checkpointed).
        checkpointer=False,
    )


def menu_entry(plan: OptionPlan[Any], title: str) -> dict[str, Any]:
    estimate = plan.estimate.as_dict()
    estimate.pop("assumptions", None)
    return {"strategy": plan.strategy, "title": title, "default_params": plan.params, "estimate": estimate}


def facts_message(
    opportunity: Opportunity,
    menu: Sequence[dict[str, Any]],
    limits: dict[str, Any],
    notes: Sequence[str],
    problems: Sequence[str],
) -> HumanMessage:
    parts = [
        "<opportunity>\n" + opportunity.model_dump_json() + "\n</opportunity>",
        "<menu>\n" + json.dumps({"strategies": list(menu), "limits": limits}, ensure_ascii=False) + "\n</menu>",
    ]
    if notes:
        parts.append("<owner_notes>\n" + "\n".join(f"- {n}" for n in notes) + "\n</owner_notes>")
    if problems:
        parts.append("<previous_problems>\n" + "\n".join(f"- {p}" for p in problems) + "\n</previous_problems>")
    parts.append("Investigate this opportunity with your tools, then return your Proposal.")
    return HumanMessage("\n\n".join(parts))


def tools_called(messages: Sequence[BaseMessage]) -> list[str]:
    names = [c["name"] for m in messages if isinstance(m, AIMessage) for c in m.tool_calls]
    return [n for n in names if n != Proposal.__name__]


async def investigate(
    spec: KindSpec,
    message: HumanMessage,
    *,
    context: Any,
    script_key: str,
) -> tuple[Proposal, list[BaseMessage]]:
    """Run the investigator; returns the proposal and the conversation (for traces and evals)."""
    agent = build_investigator(spec)
    result = await agent.ainvoke({"messages": [message]}, {"metadata": {"script_key": script_key}}, context=context)
    messages = list(result["messages"])
    proposal = result.get("structured_response")
    if not isinstance(proposal, Proposal):
        proposal = await final_proposal(spec, messages, script_key=script_key)
    if not isinstance(proposal, Proposal):
        raise RuntimeError(f"the {spec.kind} investigator returned no Proposal")
    return proposal, messages


FINAL_REQUEST = "Return your Proposal now, from the investigation above."


async def final_proposal(spec: KindSpec, messages: Sequence[BaseMessage], *, script_key: str) -> Proposal | None:
    """One more call, constrained to the schema, when the agent ended without calling its Proposal tool.

    Small local models sometimes write the Proposal as text instead (the tool strategy then ends with no structured
    response). The investigation is kept; only the choices are read from the answer, and validate recomputes them.
    """
    model = llm.chat_model(llm.ModelRole.PLANNER).with_structured_output(
        Proposal, method=llm.structured_output_method(llm.ModelRole.PLANNER)
    )
    request = [SystemMessage(system_prompt(spec)), *messages, HumanMessage(FINAL_REQUEST)]
    answer = await model.ainvoke(request, {"metadata": {"script_key": script_key}})
    return answer if isinstance(answer, Proposal) else None
