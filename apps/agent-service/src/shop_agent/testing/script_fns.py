"""Functions that `call:` script steps use to build answers from data only known at run time."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

# The strategy a scripted investigation recommends for each kind, in order of preference.
PREFERRED = {"dead_stock": ("discount", "bundle", "outlet"), "high_returns": ("repackage", "outlet")}
SOP = {"dead_stock": "SOP-001", "high_returns": "SOP-002"}


def last_tool_output(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, ToolMessage):
            return str(message.content)
    return ""


def tagged(messages: Sequence[BaseMessage], tag: str) -> str:
    """The text inside `<tag>...</tag>` of the first human message that has it."""
    for message in messages:
        if isinstance(message, HumanMessage):
            match = re.search(rf"<{tag}>\n(.*?)\n</{tag}>", str(message.content), re.DOTALL)
            if match:
                return match.group(1)
    return ""


def echo_tool_result(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> AIMessage:
    """Answer with the last tool result, verbatim (so every number in the answer comes from a tool)."""
    return AIMessage(content=last_tool_output(messages))


def propose_from_menu(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> AIMessage:
    """A Proposal: the preferred strategy of the menu with its default parameters, and "do nothing"."""
    opportunity = json.loads(tagged(messages, "opportunity"))
    menu = json.loads(tagged(messages, "menu"))
    offered = {s["strategy"]: s for s in menu["strategies"]}
    kind = opportunity["kind"]
    chosen = next((name for name in PREFERRED.get(kind, ()) if name in offered), None)
    options: list[dict[str, Any]] = []
    if chosen is not None:
        params = dict(offered[chosen]["default_params"])
        if "percent" in params:  # a well-behaved planner stays inside the limits it is told
            params["percent"] = min(float(params["percent"]), float(menu["limits"]["max_discount_pct"]))
        options.append({"option_id": chosen, "strategy": chosen, **params,
                        "rationale": f"Theo {SOP.get(kind, 'SOP')}, đây là phương án ưu tiên."})  # fmt: skip
    options.append({"option_id": "do_nothing", "strategy": "do_nothing", "rationale": "Giữ nguyên để so sánh."})
    proposal = {
        "summary": opportunity["summary"],
        "causes": [{"text": f"{opportunity['title']}: dữ liệu công cụ cho thấy cần xử lý.", "confidence": 0.6}],
        "sop_refs": [SOP[kind]] if kind in SOP else [],
        "options": options,
        "recommended_option_id": options[0]["option_id"],
        "confidence": 0.6,
    }
    return AIMessage(content="", tool_calls=[{"name": "Proposal", "args": proposal, "id": "call-proposal"}])


def lessons_from_case(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> AIMessage:
    """Lessons that restate the case's outcome and result lines (no new numbers)."""
    case = dict(line.split(": ", 1) for line in tagged(messages, "case").splitlines() if ": " in line)
    lesson = f"{case.get('kind', '?')}: {case.get('option', 'không có phương án')} -> {case.get('outcome', '?')}"
    if "result" in case:
        lesson += f" ({case['result']})"
    return AIMessage(content="", tool_calls=[{"name": "Lessons", "args": {"lessons": [lesson]}, "id": "call-lessons"}])
