"""Customer response streaming and identity boundaries on the actual production runtime."""

import httpx
import pytest
from langgraph_sdk import get_client

from tests.runtime.conftest import SERVICE_ROOT, free_port, redis_server, scratch_database, start_aegra
from tests.server.conftest import server_client, token

pytestmark = pytest.mark.runtime


async def test_customer_response_and_other_identity_denials() -> None:
    with redis_server() as redis_url, scratch_database() as database_url:
        server = start_aegra(
            free_port(),
            {
                "SHOP_ADAPTER": "fake",
                "DATABASE_URL": database_url,
                "REDIS_URL": redis_url,
                "SCRIPTED_LLM_DIR": str(SERVICE_ROOT / "tests/support/server_scripts"),
            },
        )
        try:
            customer = get_client(url=server.url, headers={"Authorization": f"Bearer {token('customer', 'user:7')}"})
            other = get_client(url=server.url, headers={"Authorization": f"Bearer {token('customer', 'user:8')}"})
            owner = server_client(server.url)
            reply = await customer.runs.wait(
                None,
                "customer_assistant",
                input={"request": {"message": "Research a model", "locale": "en", "readsAllowed": False}},
            )
            assert isinstance(reply, dict) and reply["decision"]["answer"]
            thread = await customer.threads.create()
            assert (await customer.threads.get(thread["thread_id"]))["thread_id"] == thread["thread_id"]
            staff_thread = await owner.threads.create(metadata={"private": "staff-only"})
            for client, target in [(other, thread), (customer, staff_thread)]:
                with pytest.raises(httpx.HTTPStatusError) as denied:
                    await client.threads.get(target["thread_id"])
                assert denied.value.response.status_code in {403, 404}
                with pytest.raises(httpx.HTTPStatusError) as denied_delete:
                    await client.threads.delete(target["thread_id"])
                assert denied_delete.value.response.status_code in {403, 404}
            for graph in ["monitor", "assistant", "improvement", "marketing_copy", "collect"]:
                with pytest.raises(httpx.HTTPStatusError) as denied_graph:
                    await customer.runs.wait(None, graph, input={})
                assert denied_graph.value.response.status_code == 403
            await customer.threads.delete(thread["thread_id"])
            assert (await owner.threads.get(staff_thread["thread_id"]))["thread_id"] == staff_thread["thread_id"]
        finally:
            server.stop()
