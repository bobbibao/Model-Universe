"""The copilot on the real Agent Server (`langgraph dev`), writing over HTTP to the OpenAPI-validated web double.

A chat asks for a coupon -> the thread pauses with the tool approval request -> the state has the shape the web gateway
reads (the request, and the last AI message's tool calls with their ids) -> resume with the decision and a grant in
`approval_grants` -> the double receives exactly the approved body, with the grant and the key `{thread}:{call}`.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from langgraph_sdk.schema import Command

from shop_agent.testing.grants import approve
from shop_agent.testing.scripted import SCRIPTS_DIR_ENV
from tests.server.conftest import server_client, start_dev_server, stop_dev_server
from tests.support.web_double import TOKEN, WebDouble

pytestmark = pytest.mark.server

COUPON = {"code": "AI-DON500K", "title": "Giảm 10% cho đơn từ 500.000 ₫", "percent": 10, "duration_days": 7,
          "min_order_vnd": 500000}  # fmt: skip
SCRIPT = {"server.copilot": [{"tool_calls": [{"name": "create_coupon", "args": COUPON}]}, {"content": "Đã tạo mã."}]}


async def test_copilot_approval_on_dev_server(tmp_path: Path) -> None:
    (tmp_path / "copilot.yaml").write_text(yaml.safe_dump(SCRIPT, allow_unicode=True), "utf-8")
    double = WebDouble()
    with double.serve() as base_url:
        env = {
            "SHOP_ADAPTER": "http",
            "SHOP_API_BASE_URL": base_url,
            "SHOP_API_TOKEN": TOKEN,
            SCRIPTS_DIR_ENV: str(tmp_path),
        }
        process, url, log = start_dev_server(env)
        try:
            client = server_client(url)
            thread_id = (await client.threads.create())["thread_id"]
            metadata = {"script_key": "server.copilot"}
            ask: dict[str, Any] = {
                "messages": [{"role": "user", "content": "Tạo mã giảm giá 10% cho đơn từ 500k trong 7 ngày"}]
            }
            await client.runs.wait(thread_id, "assistant", input=ask, metadata=metadata)

            state = await client.threads.get_state(thread_id)
            [interrupt] = [i for task in state["tasks"] for i in task["interrupts"]]
            [action] = interrupt["value"]["action_requests"]
            values = cast(dict[str, Any], state["values"])
            last = values["messages"][-1]
            [call] = last["tool_calls"]
            assert last["type"] == "ai" and (action["name"], action["args"]) == (call["name"], call["args"])
            assert interrupt["value"]["review_configs"][0]["allowed_decisions"] == ["approve", "edit", "reject"]
            assert double.applied == []

            key = f"{thread_id}:{call['id']}"
            grant = approve(
                thread_id=thread_id,
                actions=[(call["id"], "promotions/coupons", key, COUPON)],
                now=int(time.time()),
                tool_call_ids=[call["id"]],
            )
            command: Command = {
                "resume": {"decisions": [{"type": "approve"}]},
                "update": {"approval_grants": {call["id"]: grant}},
            }
            await client.runs.wait(thread_id, "assistant", command=command, metadata=metadata)

            [coupon] = [r for r in double.applied if r.endpoint == "promotions/coupons"]
            assert coupon.body == COUPON and coupon.idempotency_key == key
            assert coupon.headers["x-agent-approval"] == grant
            final = cast(dict[str, Any], (await client.threads.get_state(thread_id))["values"])["messages"][-1]
            assert final["content"] == "Đã tạo mã."
        except Exception:
            print(log.read_text()[-4000:])
            raise
        finally:
            stop_dev_server(process)
