"""SdkLauncher on both runtimes: langgraph dev returns each thread's state values with the search result, Aegra does
not (ADR-0013), so an expired review is found either way."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from shop_agent.graphs.launchers import SdkLauncher

NOW = datetime(2026, 10, 2, 12, 0, tzinfo=UTC)
VALUES = {
    "expired": {"review_expires_at": "2026-10-01T12:00:00+00:00"},
    "open": {"review_expires_at": "2026-10-03T12:00:00+00:00"},
}


class Threads:
    def __init__(self, *, with_values: bool) -> None:
        self.with_values = with_values
        self.state_reads: list[str] = []

    async def search(self, **_: Any) -> list[dict[str, Any]]:
        if self.with_values:
            return [{"thread_id": tid, "values": values} for tid, values in VALUES.items()]
        return [{"thread_id": tid} for tid in VALUES]

    async def get_state(self, thread_id: str) -> dict[str, Any]:
        self.state_reads.append(thread_id)
        return {"values": VALUES[thread_id]}


async def test_expired_reviews_from_search_values_on_langgraph_dev() -> None:
    threads = Threads(with_values=True)
    assert await SdkLauncher(SimpleNamespace(threads=threads)).stale_reviews(NOW) == ["expired"]  # type: ignore[arg-type]
    assert threads.state_reads == []


async def test_expired_reviews_from_thread_state_on_aegra() -> None:
    threads = Threads(with_values=False)
    assert await SdkLauncher(SimpleNamespace(threads=threads)).stale_reviews(NOW) == ["expired"]  # type: ignore[arg-type]
    assert threads.state_reads == ["expired", "open"]
