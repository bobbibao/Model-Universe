from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from shop_agent.ops import CRONS, MANAGED_BY, sync_crons

LANGGRAPH_JSON = Path(__file__).resolve().parents[2] / "langgraph.json"


class FakeCrons:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}
        self.created = 0

    async def search(self, *, metadata: dict[str, Any], limit: int) -> list[dict[str, Any]]:
        return [c for c in self.items.values() if all(c["metadata"].get(k) == v for k, v in metadata.items())]

    async def create(
        self,
        assistant_id: str,
        *,
        schedule: str,
        input: Any,
        metadata: dict[str, Any],
        on_run_completed: str = "delete",
        enabled: bool = True,
    ) -> dict[str, Any]:
        self.created += 1
        cron_id = f"cron-{self.created}"  # ids are never reused, like the server's
        self.items[cron_id] = {
            "cron_id": cron_id,
            "assistant_id": assistant_id,
            "schedule": schedule,
            "input": input,
            "metadata": metadata,
            "on_run_completed": on_run_completed,
            "enabled": enabled,
            "fired_at_creation": enabled,  # Aegra runs an enabled cron as soon as it is created
        }
        return self.items[cron_id]

    async def update(self, cron_id: str, *, enabled: bool) -> None:
        self.items[cron_id]["enabled"] = enabled

    async def delete(self, cron_id: str) -> None:
        del self.items[cron_id]


class FakeClient:
    def __init__(self) -> None:
        self.crons = FakeCrons()


def test_the_table() -> None:
    graphs = set(json.loads(LANGGRAPH_JSON.read_text(encoding="utf-8"))["graphs"])
    assert len({c.name for c in CRONS}) == len(CRONS)
    for cron in CRONS:
        assert cron.assistant_id in graphs
        for schedule in filter(None, (cron.schedule, cron.dev_schedule)):
            assert len(schedule.split()) == 5


async def test_sync_is_idempotent_and_follows_the_environment() -> None:
    client = FakeClient()
    assert await sync_crons(client, "production") == [
        "monitor: */15 * * * *",
        "collect: 45 23 * * *",
        "weekly_plan: 45 1 * * 1",
        "daily_briefing: 45 0 * * *",
    ]
    assert await sync_crons(client, "production") == []
    assert await sync_crons(client, "dev") == ["monitor: * * * * *"]  # collect keeps its daily schedule
    by_name = {c["metadata"]["cron"]: (c["assistant_id"], c["schedule"]) for c in client.crons.items.values()}
    assert by_name == {
        "monitor": ("monitor", "* * * * *"),
        "collect": ("collect", "45 23 * * *"),
        "weekly_plan": ("monitor", "45 1 * * 1"),
        "daily_briefing": ("assistant", "45 0 * * *"),
    }
    by_cron = {c["metadata"]["cron"]: c for c in client.crons.items.values()}
    assert by_cron["weekly_plan"]["input"] == {"weekly_plan": True}
    assert by_cron["daily_briefing"]["input"]["messages"][0]["role"] == "user"
    # Only the briefing's thread is kept: it is read in the console; the monitor's runs leave nothing to read.
    assert {name for name, c in by_cron.items() if c["on_run_completed"] == "keep"} == {"daily_briefing"}
    # Every cron is enabled, and none ran when it was created: crons fire on their schedule only.
    assert all(c["enabled"] and not c["fired_at_creation"] for c in by_cron.values())


async def test_leaves_foreign_crons_and_removes_stale_ones() -> None:
    client = FakeClient()
    await client.crons.create("assistant", schedule="0 1 * * *", input=None, metadata={"owner": "someone"})
    await client.crons.create(
        "monitor", schedule="0 0 * * *", input=None, metadata={"managed_by": MANAGED_BY, "cron": "old"}
    )
    changes = await sync_crons(client, "production")
    assert "old: removed" in changes
    assert sorted(c["metadata"].get("cron", "-") for c in client.crons.items.values()) == [
        "-",
        "collect",
        "daily_briefing",
        "monitor",
        "weekly_plan",
    ]
