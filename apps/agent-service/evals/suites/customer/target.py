"""One actual customer planner turn against explicitly synthetic authoritative observations."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage

from evals.evaluators import CaseOutput
from evals.fixtures import graph_fixture
from shop_agent.graphs.customer_assistant import graph

PRODUCT = {
    "id": 501,
    "name": "Synthetic MG Gundam inspection fixture",
    "grade": "MG",
    "scale": "1/100",
    "salePrice": 1450000,
    "stock": 6,
    "sizes": [],
}
BASE = {
    "locale": "en",
    "loggedIn": True,
    "readsAllowed": False,
    "message": "",
    "catalog": [PRODUCT],
    "cart": [{"productId": 501, "size": "", "quantity": 1}],
    "observations": [
        {"tool": {"kind": "my_order", "orderId": 701}, "data": {"id": 701, "status": "PROCESSING", "total": 1450000}},
        {
            "tool": {"kind": "return_options", "orderId": 702},
            "data": {"canRequest": True, "lines": [{"orderItemId": 801, "productId": 501, "returnable": 1}]},
        },
        {"tool": {"kind": "my_wishlist"}, "data": [{"id": 601, "productId": 501}]},
        {"tool": {"kind": "review_eligibility", "productId": 501}, "data": {"canReview": True}},
    ],
}


def save_decision(case_id: str, profile: str, request: dict[str, Any], decision: dict[str, Any]) -> None:
    # These cases contain only synthetic fixtures, never live customer records or credentials.
    artifacts = Path(__file__).resolve().parents[3] / ".artifacts" / "customer-eval-decisions"
    artifacts.mkdir(parents=True, exist_ok=True)
    Path(artifacts, f"{case_id}-{profile}.json").write_text(
        json.dumps({"request": request, "decision": decision}, ensure_ascii=False, indent=2), encoding="utf-8"
    )


async def run_case(case: dict[str, Any], profile: str) -> CaseOutput:
    request = {**deepcopy(BASE), **case["request"]}
    fixture = {"reads": [], "actions": [], "productIds": [], **case["scripted"]}
    with graph_fixture(profile, "customer-assistant", fixture):
        result = await graph.ainvoke({"request": request})
    decision = result["decision"]
    if profile != "scripted":
        await asyncio.to_thread(save_decision, case["id"], profile, request, decision)
    return CaseOutput(messages=[HumanMessage(json.dumps(request))], structured=decision, final_text=decision["answer"])
