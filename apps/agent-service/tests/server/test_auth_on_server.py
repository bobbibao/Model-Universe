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

from tests.server.conftest import server_client, token

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
        await owner.runs.wait(None, "collect", input={})  # market collection is the system's
    assert denied.value.response.status_code == 403


async def test_customer_stateless_response_and_thread_isolation(dev_server: str) -> None:
    customer = get_client(url=dev_server, headers={"Authorization": f"Bearer {token('customer', 'user:7')}"})
    other = get_client(url=dev_server, headers={"Authorization": f"Bearer {token('customer', 'user:8')}"})
    owner = server_client(dev_server, "owner")
    result = await customer.runs.wait(
        None,
        "customer_assistant",
        input={"request": {"message": "Find a Gundam model", "locale": "en", "readsAllowed": False}},
    )
    assert isinstance(result, dict)
    assert isinstance(result["decision"]["answer"], str)
    thread = await customer.threads.create(metadata={"customer_owner": "shop"})
    assert thread["metadata"] is not None
    assert thread["metadata"]["customer_owner"] == "customer:user:7"
    assert (await customer.threads.get(thread["thread_id"]))["thread_id"] == thread["thread_id"]
    admin_thread = await owner.threads.create(metadata={"private": "staff-only"})
    for client, target in [(other, thread), (customer, admin_thread)]:
        with pytest.raises(httpx.HTTPStatusError) as denied:
            await client.threads.get(target["thread_id"])
        assert denied.value.response.status_code in {403, 404}
        with pytest.raises(httpx.HTTPStatusError) as denied_delete:
            await client.threads.delete(target["thread_id"])
        assert denied_delete.value.response.status_code in {403, 404}
    retained = (await owner.threads.get(admin_thread["thread_id"]))["metadata"]
    assert retained is not None and retained["private"] == "staff-only"
    for graph in ["monitor", "assistant", "improvement", "marketing_copy", "collect"]:
        with pytest.raises(httpx.HTTPStatusError) as denied_graph:
            await customer.runs.wait(None, graph, input={})
        assert denied_graph.value.response.status_code == 403
    with pytest.raises(PermissionDeniedError):
        await customer.store.search_items(("private",))
    await customer.threads.delete(thread["thread_id"])


async def test_a_cron_run_opens_threads_through_the_loopback_client(dev_server: str) -> None:
    """A cron run starts inside the server; its monitor opens threads through the loopback client (system token)."""
    owner, system = server_client(dev_server, "owner"), server_client(dev_server, "system")
    await system.crons.create("monitor", schedule="* * * * *", input={}, metadata={"managed_by": "test"})
    v1 = {"dead_stock", "high_returns"}  # growth kinds open too (Phase 7); these two are always detected
    deadline = time.monotonic() + 90
    threads: list[Any] = []
    while time.monotonic() < deadline and not v1 <= {t["metadata"]["kind"] for t in threads}:
        await asyncio.sleep(3)
        threads = await owner.threads.search(metadata={"graph": "improvement"}, limit=50)
    assert v1 <= {t["metadata"]["kind"] for t in threads}
    for thread in threads:
        runs = await owner.runs.list(thread["thread_id"])
        assert runs and (runs[-1]["metadata"] or {}).get("created_by") == "system"  # the monitor's loopback client

    tick = await owner.runs.wait(None, "monitor", input={})  # "Run now" as an admin: the threads are known
    assert isinstance(tick, dict) and v1 <= {fingerprint.split(":")[0] for fingerprint in tick["skipped"]}
    known = {t["thread_id"] for t in threads}
    assert not known & set(tick["opened"])  # a known fingerprint never opens a second thread
