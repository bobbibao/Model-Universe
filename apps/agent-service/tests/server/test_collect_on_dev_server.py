"""`collect` on the real Agent Server (`langgraph dev`): a system run posts the fixture observations over HTTP to the
OpenAPI-validated web double, once per source and day."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from shop_agent.domain.growth.market import MARKET_OBSERVATIONS_ENDPOINT
from shop_agent.domain.growth.snapshot import vn_date
from tests.server.conftest import server_client, start_dev_server, stop_dev_server
from tests.support.web_double import TOKEN, WebDouble

pytestmark = pytest.mark.server


async def test_collect_on_dev_server() -> None:
    double = WebDouble()
    with double.serve() as base_url:
        env = {"SHOP_ADAPTER": "http", "SHOP_API_BASE_URL": base_url, "SHOP_API_TOKEN": TOKEN}
        process, url, log = start_dev_server(env)
        try:
            client = server_client(url, "system")
            request: dict[str, Any] = {"sources": ["fixture"]}
            out = await client.runs.wait(None, "collect", input=request)
            assert isinstance(out, dict), log.read_text()
            [result] = out["results"]
            assert result["posted"] and result["trends"] > 0 and result["competitor_prices"] > 0
            [applied] = double.applied
            assert applied.endpoint == MARKET_OBSERVATIONS_ENDPOINT
            assert applied.idempotency_key == f"collect:fixture:{vn_date(datetime.now(UTC)).isoformat()}"
        finally:
            stop_dev_server(process)
