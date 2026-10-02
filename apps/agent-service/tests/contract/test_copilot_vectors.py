"""How a copilot write tool call becomes an Agent API request: the agent's `write_request` and the web gateway (which
signs the grant over the same request) assert packages/contracts/test-vectors/copilot/write-tools.json."""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest

from shop_agent.adapters.fake_marketing import AdRecord
from shop_agent.adapters.fake_shop import FakeShop
from shop_agent.domain.approval import request_hash
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.tools.writes import WRITES, write_request
from tests.support.factories import NOW, item

VECTORS = json.loads(
    (Path(__file__).resolve().parents[4] / "packages/contracts/test-vectors/copilot/write-tools.json").read_text()
)


@pytest.fixture
async def snapshot() -> GrowthSnapshot:
    stock = {"OLD1": item("OLD1", days=200), "OLD2": item("OLD2", days=150), "RET": item("RET", days=20)}
    shop = FakeShop(stock, [], {}, clock=lambda: NOW)
    ad = AdRecord("ad-copilot-1", "ag-copilot-x", "meta", "traffic", 200_000, 1_000_000, NOW, NOW + timedelta(days=5))
    shop.marketing.ads[ad.ref] = ad
    return await shop.growth_snapshot(NOW)


def test_every_write_tool_has_a_vector() -> None:
    assert {case["tool"] for case in VECTORS["cases"]} == set(WRITES)


@pytest.mark.parametrize("case", VECTORS["cases"], ids=lambda c: c["tool"])
def test_a_tool_call_is_the_request_the_gateway_signs(case: dict[str, Any], snapshot: GrowthSnapshot) -> None:
    spec = write_request(
        case["tool"], case["args"], snapshot, thread_id=VECTORS["thread_id"], call_id=case["tool_call_id"]
    )
    assert (spec.endpoint, spec.body, spec.idempotency_key) == (case["endpoint"], case["body"], case["idempotency_key"])
    assert spec.action_id == case["tool_call_id"]
    assert request_hash(spec.endpoint, spec.body) == case["body_hash"]
    assert list(spec.editable_fields) == case["editable_fields"]
    assert WRITES[case["tool"]].protective is case["protective"]


def test_arguments_the_request_would_rewrite_are_refused(snapshot: GrowthSnapshot) -> None:
    post = {"ref": "copilot-post-1", "message": "Áo mới về.", "scheduled_at": "2026-10-05T12:00:00.000Z"}
    with pytest.raises(ValueError, match=r"scheduled_at exactly as the request takes them \("):
        write_request("create_post", post, snapshot, thread_id="chat-1", call_id="call-1")
    with pytest.raises(ValueError, match="percent"):  # a number written as text
        write_request("create_coupon", {"code": "AI-ABCD", "title": "x", "percent": "10", "duration_days": 3}, snapshot,
                      thread_id="chat-1", call_id="call-1")  # fmt: skip
