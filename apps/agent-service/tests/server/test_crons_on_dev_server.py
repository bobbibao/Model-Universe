from __future__ import annotations

import pytest

from shop_agent.ops import sync_crons
from tests.server.conftest import server_client

pytestmark = pytest.mark.server


async def test_sync_crons_on_the_dev_server(dev_server: str) -> None:
    client = server_client(dev_server, "system")
    assert await sync_crons(client, "dev") == ["monitor: * * * * *"]
    assert await sync_crons(client, "dev") == []
    crons = await client.crons.search(metadata={"cron": "monitor"})  # search needs an assistant UUID, not a graph name
    assert [c["schedule"] for c in crons] == ["* * * * *"]
