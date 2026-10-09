"""Actual channel copy graph; synthetic facts, no publishing or platform access."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage

from evals.evaluators import CaseOutput
from evals.fixtures import graph_fixture
from shop_agent.graphs.marketing_copy import graph


def save_copy(case_id: str, profile: str, request: dict[str, Any], copy: dict[str, Any]) -> None:
    # Only synthetic case facts are persisted; this target never accesses real account data.
    artifacts = Path(__file__).resolve().parents[3] / ".artifacts" / "marketing-eval-copy"
    artifacts.mkdir(parents=True, exist_ok=True)
    Path(artifacts, f"{case_id}-{profile}.json").write_text(
        json.dumps({"request": request, "copy": copy}, ensure_ascii=False, indent=2), encoding="utf-8"
    )


async def run_case(case: dict[str, Any], profile: str) -> CaseOutput:
    with graph_fixture(profile, "admin-marketing-copy", case["scripted"]):
        result = await graph.ainvoke({"request": case["request"]})
    copy = result["copy"]
    if profile != "scripted":
        await asyncio.to_thread(save_copy, case["id"], profile, case["request"], copy)
    text = " ".join(" ".join(value) if isinstance(value, list) else value for value in copy.values())
    return CaseOutput(messages=[HumanMessage(json.dumps(case["request"]))], structured=copy, final_text=text)
