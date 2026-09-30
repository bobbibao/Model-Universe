from __future__ import annotations

import pytest
from langgraph_sdk import get_client

from shop_agent.ops import sync_crons

pytestmark = pytest.mark.server


async def test_sync_crons_on_the_dev_server(dev_server: str) -> None:
    client = get_client(url=dev_server)
    assert await sync_crons(client, "dev") == ["monitor: * * * * *"]
    assert await sync_crons(client, "dev") == []
    crons = await client.crons.search(metadata={"cron": "monitor"})  # search needs an assistant UUID, not a graph name
    assert [c["schedule"] for c in crons] == ["* * * * *"]
