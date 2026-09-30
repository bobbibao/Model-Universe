"""Evaluators for agent evals. Deterministic checks run everywhere; the LLM judge runs only when its model is usable."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from agentevals.trajectory.match import create_trajectory_match_evaluator
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

NUMBER = re.compile(r"\d[\d.,]*")
VIETNAMESE_MARKS = set("ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ")


@dataclass
class CaseOutput:
    """What a suite target returns for one case."""

    messages: list[BaseMessage] = field(default_factory=list)
    structured: Any = None
    final_text: str = ""


@dataclass
class Check:
    passed: bool
    detail: str = ""
    skipped: bool = False


def tool_names(messages: Sequence[BaseMessage]) -> list[str]:
    return [call["name"] for m in messages if isinstance(m, AIMessage) for call in m.tool_calls]


def _openai_trajectory(names: Sequence[str]) -> list[dict[str, Any]]:
    return [
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": n, "arguments": "{}"}}]}
        for n in names
    ]


def check_tools(output: CaseOutput, expected: Sequence[str]) -> Check:
    """The trajectory includes every expected tool call (agentevals superset match, arguments ignored)."""
    evaluator = create_trajectory_match_evaluator(trajectory_match_mode="superset", tool_args_match_mode="ignore")
    called = tool_names(output.messages)
    result = evaluator(outputs=_openai_trajectory(called), reference_outputs=_openai_trajectory(expected))
    return Check(bool(result["score"]), f"called {called}, expected {list(expected)}")


def check_structured(output: CaseOutput, expected: bool) -> Check:
    ok = (output.structured is not None) == expected
    return Check(ok, f"structured={type(output.structured).__name__}")


def vietnamese_share(text: str) -> float:
    letters = [c for c in unicodedata.normalize("NFC", text.lower()) if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if c in VIETNAMESE_MARKS) / len(letters)


def check_language(output: CaseOutput, language: str) -> Check:
    if language != "vi":
        return Check(True, skipped=True, detail=f"no check for {language}")
    share = vietnamese_share(output.final_text)
    return Check(share >= 0.05, f"{share:.0%} Vietnamese letters")


def _normalize_number(token: str) -> str:
    return re.sub(r"[.,]", "", token)


def check_numbers_from_tools(output: CaseOutput, _expected: bool) -> Check:
    """Every number in the answer appears in a tool result or in the question (no invented numbers)."""
    sources = " ".join(str(m.content) for m in output.messages if isinstance(m, ToolMessage) or m.type == "human")
    allowed = {_normalize_number(t) for t in NUMBER.findall(sources)}
    invented = [t for t in NUMBER.findall(output.final_text) if _normalize_number(t) not in allowed]
    return Check(not invented, f"invented numbers: {invented}" if invented else "all numbers come from tools")


def check_contains(output: CaseOutput, needles: Sequence[str]) -> Check:
    text = output.final_text if output.structured is None else json.dumps(output.structured, default=str)
    missing = [n for n in needles if n.lower() not in text.lower()]
    return Check(not missing, f"missing {missing}" if missing else "")


CHECKS: dict[str, Callable[[CaseOutput, Any], Check]] = {
    "tools": check_tools,
    "structured": check_structured,
    "language": check_language,
    "numbers_from_tools": check_numbers_from_tools,
    "contains": check_contains,
}
