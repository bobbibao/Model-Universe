"""The monitor's growth steps (plan Phase 7): metrics sync, the in-flight guard, growth detection under the kill switch,
and the prioritizer's capacity. No model is called by the monitor itself."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, cast

import pytest

from shop_agent import llm
from shop_agent.adapters.fake_marketing import AdRecord, CampaignRecord
from shop_agent.domain.growth.marketing import METRICS_SYNC_ENDPOINT
from shop_agent.domain.growth.snapshot import AdDailyMetrics, vn_date
from shop_agent.graphs import monitor
from shop_agent.graphs.improvement import SIGNALS
from shop_agent.graphs.launchers import InProcessLauncher
from tests.graphs.conftest import World


@pytest.fixture
def tick(world: World) -> Any:
    launcher = InProcessLauncher(world.graph, world.deps)
    graph = monitor.build().compile(store=world.store)
    context = monitor.MonitorContext(world.deps, launcher)

    async def run(**input: Any) -> dict[str, Any]:
        report: dict[str, Any] = await graph.ainvoke(cast(monitor.State, input), context=context)
        await launcher.drain()
        return report

    run.launcher = launcher  # type: ignore[attr-defined]
    return run


def live_ad(world: World, *, spend: int, value: int) -> str:
    """An active Meta ad that spent `spend` yesterday for `value` of conversions."""
    now = world.clock()
    m = world.shop.marketing
    m.campaigns["ag-guard000-x"] = CampaignRecord(
        "ag-guard000-x", "Thử", "traffic", ["ads_meta"], None, now, now + timedelta(days=5), 2_000_000
    )
    m.ads["a-guard"] = AdRecord(
        "a-guard",
        "ag-guard000-x",
        "meta",
        "traffic",
        200_000,
        1_000_000,
        now - timedelta(days=2),
        now + timedelta(days=3),
        status="active",
        activated_at=now - timedelta(days=2),
        reserved_vnd=1_000_000,
    )
    day = vn_date(now) - timedelta(days=1)
    m.ad_metrics[("a-guard", day)] = AdDailyMetrics(
        "a-guard", "ag-guard000-x", "meta", day, 5000, 50, spend, 1, value, "active", "traffic"
    )
    return "a-guard"


async def test_roas_breach_pauses_without_a_model_call(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    ref = live_ad(world, spend=600_000, value=300_000)  # ROAS 0.5 after 600,000 VND
    monkeypatch.setattr(monitor, "detect_growth", lambda *_: [])
    world.shop.marketing.sync = lambda *_: "synced"  # type: ignore[method-assign]
    launcher = InProcessLauncher(world.graph, world.deps)  # runs start on drain(), after the tick
    graph = monitor.build().compile(store=world.store)

    def no_model(*_: Any, **__: Any) -> Any:
        raise AssertionError("the monitor must not call a model")

    with monkeypatch.context() as patched:
        patched.setattr(llm, "chat_model", no_model)
        report = await graph.ainvoke({}, context=monitor.MonitorContext(world.deps, launcher))
    assert report["guarded"] == [ref]
    assert world.shop.marketing.ads[ref].status == "paused"
    pause = next(s for s in world.shop.sent if s.endpoint == f"marketing/ads/{ref}/pause")
    assert pause.applied and not pause.grant  # protective: always allowed, no grant
    [incident] = report["incidents"]
    assert launcher.metadata[incident]["kind"] == "incident_review"
    await launcher.drain()
    assert not launcher.errors
    values = await launcher.values(incident)  # it only learns
    assert (values["stage"], values["outcome"]) == ("closed", "incident") and values["lessons"]


async def test_metrics_sync_runs_at_most_every_55_minutes(
    world: World, tick: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(monitor, "detect_growth", lambda *_: [])
    assert (await tick())["synced"]
    world.clock.advance(minutes=30)
    assert not (await tick())["synced"]
    world.clock.advance(minutes=30)
    assert (await tick())["synced"]
    assert len([s for s in world.shop.sent if s.endpoint == METRICS_SYNC_ENDPOINT]) == 2


async def test_kill_switch_opens_no_growth_threads(world: World, tick: Any) -> None:
    world.shop.settings["growth.enabled"] = False
    report = await tick(weekly_plan=True)
    kinds = {tick.launcher.metadata[t]["kind"] for t in report["opened"]}
    assert kinds <= {"dead_stock", "high_returns"}


async def test_growth_threads_respect_capacity_and_defer_the_rest(world: World, tick: Any) -> None:
    report = await tick(weekly_plan=True)
    growth = [t for t in report["opened"] if tick.launcher.metadata[t]["kind"] not in ("dead_stock", "high_returns")]
    assert 1 <= len(growth) <= 2  # max_new_per_tick
    assert len({tick.launcher.metadata[t]["kind"] for t in growth}) == len(growth)  # one per kind per tick
    assert report["deferred"] and all(d["reason"] for d in report["deferred"])
    signals = {i.value["thread_id"] for i in await world.store.asearch(SIGNALS, limit=100)}
    assert set(report["opened"]) <= signals
