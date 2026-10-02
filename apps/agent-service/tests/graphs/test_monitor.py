from __future__ import annotations

from typing import Any

import pytest

from shop_agent.domain.growth.marketing import METRICS_SYNC_ENDPOINT
from shop_agent.graphs import monitor
from shop_agent.graphs.improvement import SIGNALS
from shop_agent.graphs.launchers import InProcessLauncher
from tests.graphs.conftest import World


@pytest.fixture
def tick(world: World, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A monitor tick over the v1 kinds only (growth detection: tests/graphs/test_growth_monitor.py)."""
    monkeypatch.setattr(monitor, "detect_growth", lambda *_: [])
    launcher = InProcessLauncher(world.graph, world.deps)
    graph = monitor.build().compile(store=world.store)
    context = monitor.MonitorContext(world.deps, launcher)

    async def run() -> dict[str, Any]:
        report: dict[str, Any] = await graph.ainvoke({}, context=context)
        await launcher.drain()
        return report

    run.launcher = launcher  # type: ignore[attr-defined]
    return run


async def test_opens_one_thread_per_opportunity(tick: Any) -> None:
    report = await tick()
    assert len(report["opened"]) == 2
    pending = await tick.launcher.interrupted()
    assert sorted(payload["kind"] for _, payload in pending) == ["dead_stock", "high_returns"]
    metadata = tick.launcher.metadata[report["opened"][0]]
    assert metadata["graph"] == "improvement" and metadata["fingerprint"]


async def test_dedupe_same_fingerprint(world: World, tick: Any) -> None:
    first = await tick()
    second = await tick()
    assert second["opened"] == [] and len(second["skipped"]) == 2
    assert set(tick.launcher.metadata) == set(first["opened"])
    # The same fingerprint opens again (a new thread) only once its thread is closed and the cooldown has passed.
    fingerprint = world.opportunity().fingerprint
    record = await world.store.aget(SIGNALS, fingerprint)
    assert record is not None
    await world.store.aput(SIGNALS, fingerprint, {**record.value, "closed_at": world.clock().isoformat()})
    assert (await tick())["opened"] == []
    world.clock.advance(hours=73)
    reopened = await tick()
    assert len(reopened["opened"]) == 1 and reopened["opened"][0] not in first["opened"]
    assert reopened["opened"][0] == monitor.thread_id_for(fingerprint, 2)


async def test_expiry_goes_to_learn(world: World, tick: Any) -> None:
    await tick()
    world.clock.advance(hours=49)  # APPROVAL_TTL_HOURS = 48
    report = await tick()
    assert len(report["expired"]) == 2
    for thread_id in report["expired"]:
        values = await tick.launcher.values(thread_id)
        assert (values["outcome"], values["stage"]) == ("expired", "closed")
    assert [s for s in world.shop.sent if s.endpoint != METRICS_SYNC_ENDPOINT] == []  # only the hourly metrics sync


async def test_due_followup_is_measured(world: World, tick: Any) -> None:
    await tick()
    for thread_id, payload in await tick.launcher.interrupted():
        world.thread_id = thread_id
        await tick.launcher.resume(
            thread_id, {"type": "approve", "option_id": payload["recommended_option_id"], "grant": world.grant(payload)}
        )
    await tick.launcher.drain()
    world.clock.advance(days=15)
    world.shop.advance_days(15)
    report = await tick()
    assert len(report["woken"]) == 2
    for thread_id in report["woken"]:
        assert (await tick.launcher.values(thread_id))["stage"] == "closed"


async def test_failed_runs_are_retried(world: World, tick: Any, scripts: Any) -> None:
    scripts({"improvement.investigate.dead_stock": [{"content": "no proposal"}]})
    await tick()
    assert tick.launcher.errors  # the dead-stock run failed; its thread keeps the checkpoint
    scripts({})  # the model works again: back to the default script
    report = await tick()
    assert report["retried"] and not tick.launcher.errors
