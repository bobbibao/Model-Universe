"""Durability on the production runtime (plan Phase 9, ADR-0013): the server dies in Act right after the first step
reached the shop; after a restart the run is recovered and every write is applied exactly once.

Also proves the runtime's gaps are closed: the threads `monitor` opens (as `system`) are in an admin's inbox, and a
review is resumed with a grant through the same API the web gateway uses.
"""

from __future__ import annotations

import asyncio
import subprocess
import time
from collections import Counter
from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from shop_agent.testing.grants import approve_option
from tests.runtime.conftest import free_port, redis_server, scratch_database, start_aegra
from tests.server.conftest import server_client
from tests.support.web_double import TOKEN, Received, WebDouble

pytestmark = pytest.mark.runtime

TIMEOUT_S = 90.0


async def wait_for(check: Callable[[], Awaitable[Any]], what: str) -> Any:
    deadline = time.monotonic() + TIMEOUT_S
    while time.monotonic() < deadline:
        value = await check()
        if value:
            return value
        await asyncio.sleep(0.5)
    raise AssertionError(f"timed out waiting for {what}")


async def test_a_crash_in_act_resumes_and_writes_exactly_once() -> None:
    double = WebDouble()
    with double.serve() as base_url, redis_server() as redis_url, scratch_database() as database_url:
        port = free_port()
        env = {
            "SHOP_ADAPTER": "http",
            "SHOP_API_BASE_URL": base_url,
            "SHOP_API_TOKEN": TOKEN,
            "DATABASE_URL": database_url,
            "REDIS_URL": redis_url,
        }
        first = start_aegra(port, {**env, "FAULT_KILL_AFTER_STEP": "1"})
        second = None
        try:
            owner = server_client(first.url)
            await owner.runs.wait(None, "monitor", input={})

            async def inbox() -> list[Any]:
                threads = await owner.threads.search(status="interrupted", metadata={"graph": "improvement"})
                return threads if "dead_stock" in {(t["metadata"] or {}).get("kind") for t in threads} else []

            threads = await wait_for(inbox, "the monitor's threads in the admin's inbox")
            thread_id = next(t["thread_id"] for t in threads if t["metadata"]["kind"] == "dead_stock")
            state = await owner.threads.get_state(thread_id)
            payload = state["tasks"][0]["interrupts"][0]["value"]
            option = next(o for o in payload["options"] if o["option_id"] == payload["recommended_option_id"])
            keys = [action["idempotency_key"] for action in option["actions"]]
            assert len(keys) >= 2, "the crash must fall between two steps"
            grant = approve_option(thread_id=thread_id, option=option, now=int(time.time()))
            decision = {"type": "approve", "option_id": option["option_id"], "approver": "owner", "grant": grant}
            await owner.runs.create(thread_id, "improvement", command={"resume": decision})

            try:
                await asyncio.to_thread(first.process.wait, TIMEOUT_S)  # FAULT_KILL_AFTER_STEP=1 kills it in Act
            except subprocess.TimeoutExpired:
                pytest.fail("the server should have died after the first step")

            def option_steps(requests: list[Received]) -> Counter[str | None]:
                return Counter(r.idempotency_key for r in requests if r.idempotency_key in keys)

            assert option_steps(double.applied) == Counter(keys[:1])

            second = start_aegra(port, env)

            async def acted() -> dict[str, Any] | None:
                values = (await owner.threads.get_state(thread_id))["values"]  # Aegra's threads carry no values
                return values if isinstance(values, dict) and values.get("stage") == "measuring" else None

            values = await wait_for(acted, "the recovered run to finish Act")
            assert option_steps(double.applied) == Counter(keys)  # every step once, the one sent before the crash too
            sent = option_steps(double.received)
            assert sent[keys[0]] == 2 and all(sent[key] == 1 for key in keys[1:])  # resent once, answered as a replay
            assert [s["idempotency_key"] for s in values["steps"]] == keys and all(s["ok"] for s in values["steps"])
            assert all(r.headers["x-agent-approval"] == grant for r in double.received if r.idempotency_key in keys)
        except Exception:
            for server in (first, second):
                if server is not None:
                    print(server.log.read_text()[-4000:])
            raise
        finally:
            for server in (first, second):
                if server is not None:
                    server.stop()
