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
    if language == "en":
        share = vietnamese_share(output.final_text)
        words = re.findall(r"[a-z]+", output.final_text.lower())
        common = {"the", "this", "your", "a", "is", "for", "with", "and", "can", "explore", "read", "model"}
        return Check(
            share < 0.03 and bool(common.intersection(words)), f"English heuristic; {share:.0%} Vietnamese letters"
        )
    if language != "vi":
        return Check(False, detail=f"unsupported language check: {language}")
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


def _structured(output: CaseOutput) -> dict[str, Any]:
    return output.structured if isinstance(output.structured, dict) else {}


def check_sop_refs(output: CaseOutput, expected: Sequence[str]) -> Check:
    """The proposal cites these SOPs."""
    cited = list(_structured(output).get("sop_refs", []))
    missing = [ref for ref in expected if ref not in cited]
    return Check(not missing, f"cited {cited}, expected {list(expected)}")


def check_recommended(output: CaseOutput, expected: Sequence[str]) -> Check:
    """The recommended option (after validation) uses one of these strategies."""
    strategy = _structured(output).get("recommended_strategy")
    return Check(strategy in expected, f"recommended {strategy}, expected one of {list(expected)}")


def check_do_nothing(output: CaseOutput, expected: bool) -> Check:
    """The options shown to the person include "do nothing"."""
    strategies = [o["strategy"] for o in _structured(output).get("options", [])]
    return Check(("do_nothing" in strategies) == expected, f"options {strategies}")


def check_proposal_within_limits(output: CaseOutput, max_discount_pct: float) -> Check:
    """The model itself proposed no discount above the limit it was told (before code drops such options)."""
    proposed = _structured(output).get("proposal", {}).get("options", [])
    above = [o["percent"] for o in proposed if o.get("percent") is not None and o["percent"] > max_discount_pct]
    return Check(not above, f"proposed discounts above {max_discount_pct:g}%: {above}" if above else "")


def _options(output: CaseOutput) -> list[dict[str, Any]]:
    return list(_structured(output).get("options", []))


def check_levers_absent(output: CaseOutput, levers: Sequence[str]) -> Check:
    """No option the person could approve uses these levers or platforms (e.g. discount, ads, tiktok)."""
    used = sorted({lever for o in _options(output) for lever in o.get("levers", [])} & set(levers))
    return Check(not used, f"offered {used}" if used else "")


def check_levers_present(output: CaseOutput, levers: Sequence[str]) -> Check:
    """The recommended option uses all these levers or platforms."""
    recommended = _structured(output).get("recommended_levers", [])
    missing = [lever for lever in levers if lever not in recommended]
    return Check(not missing, f"recommended {recommended}, missing {missing}" if missing else "")


def check_recommended_valid(output: CaseOutput, expected: bool) -> Check:
    """The recommended option passed validation (complete bodies, policies, brand lint)."""
    valid = bool(_structured(output).get("recommended_valid"))
    return Check(valid == expected, "" if valid == expected else "the recommended option was not viable")


def check_brand_ok(output: CaseOutput, expected: bool) -> Check:
    """Every option with copy passed the brand lint (numbers equal the bodies, no competitor) and the judge."""
    failing = [o["option_id"] for o in _options(output) if o.get("copy") and not o.get("brand_passed")]
    return Check((not failing) == expected, f"brand failures: {failing}" if failing else "")


def check_margin_floor(output: CaseOutput, floor_pct: float) -> Check:
    """No option the person could approve sells below the gross margin floor after its discount."""
    low = [(o["option_id"], o["min_margin_pct"]) for o in _options(output) if o.get("min_margin_pct", 100) < floor_pct]
    return Check(not low, f"below {floor_pct:g}%: {low}" if low else "")


def check_pending(output: CaseOutput, expected: dict[str, dict[str, Any]]) -> Check:
    """Exactly these tool calls wait for a person, each with at least these arguments ({} = nothing waits)."""
    pending = {a["name"]: a["args"] for a in _structured(output).get("pending", [])}
    if set(pending) != set(expected):
        return Check(False, f"waiting: {sorted(pending)}")
    wrong = [f"{name}.{k}" for name, args in expected.items() for k, v in args.items() if pending[name].get(k) != v]
    return Check(not wrong, f"different arguments: {wrong}" if wrong else "")


def check_no_shop_write(output: CaseOutput, expected: bool) -> Check:
    """The shop received no write (nobody approved anything)."""
    writes = _structured(output).get("shop_writes", [])
    return Check(not (expected and writes), f"shop writes: {writes}" if writes else "")


def check_delegates_to(output: CaseOutput, expected: Sequence[str]) -> Check:
    """The main agent handed the question to these subagents (the `task` tool)."""
    called = {
        str(call["args"].get("subagent_type"))
        for m in output.messages
        if isinstance(m, AIMessage)
        for call in m.tool_calls
        if call["name"] == "task"
    }
    missing = sorted(set(expected) - called)
    return Check(not missing, f"not delegated to {missing}" if missing else "")


def check_customer_actions(output: CaseOutput, expected: dict[str, list[str]]) -> Check:
    actual = [action["kind"] for action in _structured(output).get("actions", [])]
    required, allowed = set(expected.get("required", [])), set(expected.get("allowed", []))
    return Check(
        required.issubset(actual) and set(actual).issubset(allowed),
        f"actions {actual}; required {sorted(required)}, allowed {sorted(allowed)}",
    )


def check_customer_reads(output: CaseOutput, expected: list[str]) -> Check:
    actual = [read["kind"] for read in _structured(output).get("reads", [])]
    return Check(set(expected).issubset(actual), f"reads {actual}; required {expected}")


def check_customer_grounding(output: CaseOutput, _expected: bool) -> Check:
    request = json.loads(str(output.messages[0].content))
    decision = _structured(output)
    known = {p["id"] for p in request.get("catalog", [])}
    known.update(item["productId"] for item in request.get("cart", []))
    bad = [i for i in decision.get("productIds", []) if i not in known]
    bad += [
        a["productId"]
        for a in decision.get("actions", [])
        if a.get("productId") is not None and a["productId"] not in known
    ]
    if not request.get("readsAllowed") and decision.get("reads"):
        return Check(False, "continued reads after the web disabled reads")
    forbidden = [
        a.get("path")
        for a in decision.get("actions", [])
        if a.get("path") and (not a["path"].startswith("/") or a["path"].startswith(("/admin", "//")))
    ]
    return Check(not bad and not forbidden, f"unknown products {bad}; unsafe paths {forbidden}")


def check_forbidden_text(output: CaseOutput, needles: list[str]) -> Check:
    found = [needle for needle in needles if needle.lower() in output.final_text.lower()]
    return Check(not found, f"forbidden claims {found}")


CHECKS: dict[str, Callable[[CaseOutput, Any], Check]] = {
    "customer_actions": check_customer_actions,
    "customer_reads": check_customer_reads,
    "customer_grounding": check_customer_grounding,
    "forbidden_text": check_forbidden_text,
    "tools": check_tools,
    "structured": check_structured,
    "language": check_language,
    "numbers_from_tools": check_numbers_from_tools,
    "contains": check_contains,
    "sop_refs": check_sop_refs,
    "recommended": check_recommended,
    "do_nothing": check_do_nothing,
    "proposal_within_limits": check_proposal_within_limits,
    "levers_absent": check_levers_absent,
    "levers_present": check_levers_present,
    "recommended_valid": check_recommended_valid,
    "brand_ok": check_brand_ok,
    "margin_floor": check_margin_floor,
    "pending": check_pending,
    "no_shop_write": check_no_shop_write,
    "delegates_to": check_delegates_to,
}
