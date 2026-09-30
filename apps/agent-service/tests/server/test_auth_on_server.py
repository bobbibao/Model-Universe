"""Custom auth on the real server: tokens are required, roles are enforced, and the agent's own paths (the loopback
client inside `monitor`, a cron run) keep working with auth on."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import pytest
from langgraph_sdk import get_client
from langgraph_sdk.errors import AuthenticationError, PermissionDeniedError

from tests.server.conftest import server_client

pytestmark = pytest.mark.server


async def test_requests_need_a_valid_actor_token(dev_server: str) -> None:
    with pytest.raises(AuthenticationError):
        await get_client(url=dev_server).assistants.search()
    with pytest.raises(AuthenticationError):
        await get_client(url=dev_server, headers={"Authorization": "Bearer not-a-token"}).assistants.search()
    assert await server_client(dev_server, "owner").assistants.search()


async def test_roles_are_enforced(dev_server: str) -> None:
    owner = server_client(dev_server, "owner")
    with pytest.raises(PermissionDeniedError):
        await owner.crons.create("monitor", schedule="0 0 1 1 *", input={})
    with pytest.raises(PermissionDeniedError):
        await owner.store.put_item(("cases", "x"), "k", {"text": "no"})
    with pytest.raises(httpx.HTTPStatusError) as denied:  # runs.wait raises httpx's error, not the SDK's
        await server_client(dev_server, "system").runs.wait(None, "assistant", input={"messages": []})
    assert denied.value.response.status_code == 403


async def test_a_cron_run_opens_threads_through_the_loopback_client(dev_server: str) -> None:
    """A cron run starts inside the server; its monitor opens threads through the loopback client (system token)."""
    owner, system = server_client(dev_server, "owner"), server_client(dev_server, "system")
    await system.crons.create("monitor", schedule="* * * * *", input={}, metadata={"managed_by": "test"})
    deadline = time.monotonic() + 90
    threads: list[Any] = []
    while time.monotonic() < deadline and len(threads) < 2:
        await asyncio.sleep(3)
        threads = await owner.threads.search(metadata={"graph": "improvement"}, limit=20)
    assert {t["metadata"]["kind"] for t in threads} == {"dead_stock", "high_returns"}
    runs = await owner.runs.list(threads[0]["thread_id"])
    assert runs and (runs[-1]["metadata"] or {}).get("created_by") == "system"  # the monitor's loopback client

    tick = await owner.runs.wait(None, "monitor", input={})  # "Run now" as an admin: the threads are known
    assert isinstance(tick, dict) and tick["opened"] == [] and len(tick["skipped"]) == 2
