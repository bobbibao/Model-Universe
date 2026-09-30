from __future__ import annotations

import pytest
from langgraph_sdk import get_client

pytestmark = pytest.mark.server

REQUIRED_GRAPHS = {"improvement", "monitor", "assistant"}


async def test_server_lists_graphs_and_runs_improvement(dev_server: str) -> None:
    client = get_client(url=dev_server)
    assistants = await client.assistants.search(limit=50)
    graph_ids = {assistant["graph_id"] for assistant in assistants}
    assert graph_ids >= REQUIRED_GRAPHS  # a superset: later phases add graphs

    thread = await client.threads.create()
    result = await client.runs.wait(thread["thread_id"], "improvement", input={"stage": "smoke"})
    assert isinstance(result, dict)
    assert result.get("stage") == "smoke"
