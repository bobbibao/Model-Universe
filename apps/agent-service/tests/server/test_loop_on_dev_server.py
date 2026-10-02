"""The loop on the real Agent Server (`langgraph dev`), writing over HTTP to the OpenAPI-validated web double.

monitor opens threads -> the inbox (interrupted threads) -> resume with an edit and a grant -> the double receives the
edited body exactly once -> a later monitor sweep measures, learns and closes the thread.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from shop_agent.testing.grants import approve_option
from tests.server.conftest import server_client, start_dev_server, stop_dev_server
from tests.support.web_double import TOKEN, WebDouble

pytestmark = pytest.mark.server

TIMEOUT_S = 60.0


async def wait_for(check: Callable[[], Awaitable[Any]], what: str) -> Any:
    deadline = time.monotonic() + TIMEOUT_S
    while time.monotonic() < deadline:
        value = await check()
        if value:
            return value
        await asyncio.sleep(0.5)
    raise AssertionError(f"timed out waiting for {what}")


async def test_loop_on_dev_server() -> None:
    double = WebDouble()
    with double.serve() as base_url:
        env = {
            "SHOP_ADAPTER": "http",
            "SHOP_API_BASE_URL": base_url,
            "SHOP_API_TOKEN": TOKEN,
            "DEMO_MEASURE_AFTER_MINUTES": "0",
        }
        process, url, log = start_dev_server(env)
        try:
            client = server_client(url)
            await client.runs.wait(None, "monitor", input={})

            async def inbox() -> list[Any]:
                threads = await client.threads.search(status="interrupted", metadata={"graph": "improvement"})
                return threads if len(threads) == 2 else []

            threads = await wait_for(inbox, "two interrupted improvement threads")
            thread = next(t for t in threads if t["metadata"]["kind"] == "dead_stock")
            state = await client.threads.get_state(thread["thread_id"])
            payload = state["tasks"][0]["interrupts"][0]["value"]
            option = next(o for o in payload["options"] if o["option_id"] == payload["recommended_option_id"])
            args = {"percent": 25}
            grant = approve_option(thread_id=thread["thread_id"], option=option, now=int(time.time()), args=args)
            decision = {
                "type": "edit",
                "option_id": option["option_id"],
                "args": args,
                "approver": "e2e",
                "grant": grant,
            }
            await client.runs.wait(thread["thread_id"], "improvement", command={"resume": decision})

            discounts = [r for r in double.applied if r.endpoint == "pricing/discounts"]
            assert len(discounts) == 1 and discounts[0].body["percent"] == 25.0
            assert discounts[0].headers["x-agent-approval"] == grant
            assert discounts[0].idempotency_key == f"{thread['thread_id']}:{option['option_id']}:1"

            await client.runs.wait(None, "monitor", input={})  # the sweep wakes the due follow-up

            async def closed() -> bool:
                values = (await client.threads.get(thread["thread_id"]))["values"]
                return isinstance(values, dict) and values.get("stage") == "closed"

            await wait_for(closed, "the thread to close after measure and learn")
            values = (await client.threads.get(thread["thread_id"]))["values"]
            assert isinstance(values, dict) and values["outcome"] == "measured" and values["lessons"]
            assert len([r for r in double.applied if r.endpoint == "pricing/discounts"]) == 1
        except Exception:
            print(log.read_text()[-4000:])
            raise
        finally:
            stop_dev_server(process)
