"""`shop-agent sync-crons` on the production runtime: the crons exist, are enabled and fire on their schedule only.
Aegra runs a cron as soon as it is created unless it starts disabled (ADR-0013); without that, every deploy that
changes a schedule would collect market data, plan the week and brief the owner off-schedule."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from shop_agent.ops import MANAGED_BY, sync_crons
from tests.runtime.conftest import free_port, redis_server, scratch_database, start_aegra
from tests.server.conftest import server_client
from tests.support.web_double import TOKEN, WebDouble

pytestmark = pytest.mark.runtime


async def test_crons_fire_on_their_schedule_only() -> None:
    double = WebDouble()
    with double.serve() as base_url, redis_server() as redis_url, scratch_database() as database_url:
        env = {
            "SHOP_ADAPTER": "http",
            "SHOP_API_BASE_URL": base_url,
            "SHOP_API_TOKEN": TOKEN,
            "DATABASE_URL": database_url,
            "REDIS_URL": redis_url,
        }
        server = start_aegra(free_port(), env)
        try:
            system = server_client(server.url, "system")
            changes = await sync_crons(system, "production")
            assert [change.split(":")[0] for change in changes] == [
                "monitor",
                "collect",
                "weekly_plan",
                "daily_briefing",
            ]
            assert await sync_crons(system, "production") == []

            crons = await system.crons.search(metadata={"managed_by": MANAGED_BY}, limit=10)
            assert len(crons) == 4
            now = datetime.now(UTC)
            for cron in crons:
                assert cron.get("enabled", True), cron
                assert datetime.fromisoformat(str(cron["next_run_date"])) > now, cron
            await asyncio.sleep(3)
            assert double.received == []  # no monitor tick (metrics sync) and no collection ran at creation
        except Exception:
            print(server.log.read_text(encoding="utf-8")[-4000:])
            raise
        finally:
            server.stop()
