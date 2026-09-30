"""Runs and the scheduler (T-09): never two runs at once, one failure never stops the rest, clean shutdown, live
progress, and the same actor-JWT auth on every route. No network, no database."""
import threading
import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from ci_agent.application.workflow import TickReport
from ci_agent.bootstrap.container import Container
from ci_agent.bootstrap.demo import build_demo_world
from ci_agent.config.settings import Settings
from ci_agent.domain.models.improvement import ImprovementStatus
from ci_agent.domain.models.notification import Role
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock
from ci_agent.interfaces.http import app as app_module
from ci_agent.interfaces.http.app import create_app
from ci_agent.interfaces.http.auth import mint_actor_token
from ci_agent.interfaces.http.dependencies import get_container, runs_for
from ci_agent.interfaces.http.routers import runs as runs_router
from ci_agent.interfaces.runs import RunManager, TickScheduler

SECRET = "test-actor-secret-0123456789abcdef"


def _wait_until(condition, timeout=5.0):
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "timed out"
        time.sleep(0.01)


class BlockingTick:
    """A tick that waits until released: a run with a very slow LLM."""

    def __init__(self) -> None:
        self.started, self.release, self.calls = threading.Event(), threading.Event(), 0
        self.active = self.max_active = 0
        self._lock = threading.Lock()

    def __call__(self, progress) -> TickReport:
        with self._lock:
            self.calls += 1
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        self.started.set()
        progress("detected", {"expired": 0, "detected": 1, "to_advance": 1})
        self.release.wait(5)
        progress("advanced", {"improvement_id": "imp-1", "done": 1, "total": 1, "status": "awaiting_human",
                              "error": None})
        with self._lock:
            self.active -= 1
        return TickReport(detected=["imp-1"], advanced={"imp-1": "awaiting_human"})


# RunManager -----------------------------------------------------------------------------------------------------

def test_a_second_run_is_refused_while_one_is_in_progress_not_queued():
    tick = BlockingTick()
    runs = RunManager(tick)
    first = threading.Thread(target=runs.run, args=("scheduler",))
    first.start()
    assert tick.started.wait(2)
    assert runs.run("manual") is None and runs.busy()["trigger"] == "scheduler"
    tick.release.set()
    first.join(2)
    assert runs.busy() is None and runs.status()["last_run"]["trigger"] == "scheduler"
    assert runs.run("manual") is not None and tick.calls == 2  # free again afterwards


def test_a_slow_run_never_overlaps_with_the_scheduler_or_the_button():
    tick = BlockingTick()
    runs = RunManager(tick)
    scheduler = TickScheduler(runs, interval_s=0.01)
    scheduler.start()
    assert tick.started.wait(2)
    refused = [runs.run("manual") for _ in range(5)]
    time.sleep(0.1)  # the scheduler keeps waking up meanwhile
    tick.release.set()
    _wait_until(lambda: tick.calls >= 3)
    assert scheduler.stop(2)
    assert refused == [None] * 5 and tick.max_active == 1


def test_progress_reaches_subscribers_and_a_broken_subscriber_is_dropped():
    tick = BlockingTick()
    tick.release.set()
    runs = RunManager(tick)
    events = []
    runs.subscribe(lambda message: events.append(message))

    def broken(_message):
        raise RuntimeError("client went away")

    runs.subscribe(broken)
    assert runs.run("manual") is not None
    assert [e["event"] for e in events] == ["run_started", "detected", "advanced", "run_finished"]
    assert events[-1]["detected"] == 1 and events[-1]["error"] is None and events[0]["trigger"] == "manual"
    assert len(runs._subscribers) == 1  # the broken one was dropped on its first failure


def test_a_failed_run_is_reported_and_releases_the_lock():
    def failing(_progress):
        raise RuntimeError("shop database unreachable")

    runs = RunManager(failing)
    events = []
    runs.subscribe(events.append)
    with pytest.raises(RuntimeError):
        runs.run("manual")
    assert events[-1]["event"] == "run_failed" and "shop database unreachable" in events[-1]["error"]
    assert runs.busy() is None and runs.status()["last_run"]["error"].startswith("RuntimeError")


# TickScheduler ---------------------------------------------------------------------------------------------------

def test_one_failed_run_does_not_stop_the_scheduler():
    calls = []

    def tick(_progress):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("first run fails")
        return TickReport()

    scheduler = TickScheduler(RunManager(tick), interval_s=0.01)
    scheduler.start()
    _wait_until(lambda: len(calls) >= 3)
    assert scheduler.stop(2)


def test_stop_is_prompt_when_idle_and_bounded_during_a_run():
    idle = TickScheduler(RunManager(lambda _p: TickReport()), interval_s=3600)
    idle.start()
    started = time.monotonic()
    assert idle.stop(2) and time.monotonic() - started < 1  # does not wait for the interval

    tick = BlockingTick()
    busy = TickScheduler(RunManager(tick), interval_s=0.01)
    busy.start()
    assert tick.started.wait(2)
    assert busy.stop(0.2) is False  # a run is in progress: stop gives up after the timeout
    tick.release.set()
    _wait_until(lambda: not busy._thread.is_alive())
    assert tick.calls == 1  # no new run after stop


# The coordinator's progress hook ----------------------------------------------------------------------------------

def _world():
    clock = ManualClock(datetime(2026, 1, 5, 9, tzinfo=UTC))
    return build_demo_world(shop=FakeShop.seed_demo(clock, n_stock=60, n_returns=15, seed=3), clock=clock)


def test_one_failing_improvement_never_stops_the_others_and_is_reported():
    world = _world()
    coordinator = world.workflow.coordinator
    real_advance, failed = coordinator.advance, []

    def advance(improvement_id, max_steps=20):
        if not failed:
            failed.append(improvement_id)
            raise RuntimeError("LLM and rules both exploded")
        return real_advance(improvement_id, max_steps)

    coordinator.advance = advance
    events = []
    report = coordinator.tick(lambda event, data: events.append((event, data)))
    assert list(report.errors) == failed and len(report.advanced) == len(report.detected) - 1
    assert all(status == "awaiting_human" for status in report.advanced.values())
    advanced = [data for event, data in events if event == "advanced"]
    assert [d["done"] for d in advanced] == list(range(1, len(report.detected) + 1))
    assert advanced[0]["error"] == "RuntimeError: LLM and rules both exploded"


def test_a_raising_progress_observer_never_breaks_a_tick():
    def observer(_event, _data):
        raise RuntimeError("observer bug")

    report = _world().workflow.coordinator.tick(observer)
    assert report.detected and not report.errors


# HTTP: auth, status, SSE, lifespan ---------------------------------------------------------------------------------

def _client(settings=None, world=None):
    settings = settings or Settings(_env_file=None, agent_actor_secret=SECRET)
    world = world or _world()
    app = create_app(settings)
    container = Container(settings, world.workflow)
    app.dependency_overrides[get_container] = lambda: container
    return app, container, settings


def _auth(settings, role=Role.OWNER):
    return {"Authorization": f"Bearer {mint_actor_token('1', role, settings, datetime.now(UTC))}"}


@pytest.mark.parametrize("path", ["/runs/status", "/runs/events"])
def test_status_and_progress_need_a_manager_token(path):
    app, _, settings = _client()
    client = TestClient(app)
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    assert client.get(path, headers=_auth(settings, Role.STAFF)).status_code == 403


def test_the_event_stream_starts_with_the_status_then_follows_a_run(monkeypatch):
    monkeypatch.setattr(runs_router, "SSE_MAX_SECONDS", 1.5)
    monkeypatch.setattr(runs_router, "SSE_HEARTBEAT_S", 0.2)
    app, container, settings = _client()
    client = TestClient(app)
    threading.Timer(0.3, lambda: runs_for(app, container).run("manual")).start()
    with client.stream("GET", "/runs/events", headers=_auth(settings)) as response:
        assert response.status_code == 200 and response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())
    events = [line.removeprefix("event: ") for line in body.splitlines() if line.startswith("event: ")]
    assert events[0] == "status" and "run_started" in events and events[-1] == "run_finished"
    assert "detected" in events and "advanced" in events


def test_manual_run_is_409_while_a_run_is_in_progress():
    app, container, settings = _client()
    tick = BlockingTick()
    runs = runs_for(app, container)
    runs._tick = tick
    worker = threading.Thread(target=runs.run, args=("scheduler",))
    worker.start()
    assert tick.started.wait(2)
    client = TestClient(app)
    busy = client.post("/runs", headers=_auth(settings))
    status = client.get("/runs/status", headers=_auth(settings)).json()
    tick.release.set()
    worker.join(2)
    assert busy.status_code == 409 and "already in progress (started by the scheduler" in busy.json()["detail"]
    assert status["running"]["trigger"] == "scheduler" and status["running"]["total"] == 1


def test_the_scheduler_runs_only_when_enabled_and_stops_with_the_app(monkeypatch):
    monkeypatch.setattr(app_module, "SCHEDULER_STOP_TIMEOUT_S", 2.0)
    settings = Settings(_env_file=None, agent_actor_secret=SECRET, scheduler_enabled=True,
                        demo_measure_after_minutes=5)
    app, container, _ = _client(settings)
    with TestClient(app) as client:
        status = client.get("/runs/status", headers=_auth(settings)).json()
        assert status["scheduler"]["enabled"] is True and status["scheduler"]["interval_seconds"] == 900
        assert status["demo"] == {"measure_after_minutes": 5}
    assert runs_for(app, container).status()["scheduler"] == {"enabled": False}  # stopped at shutdown

    off, _, off_settings = _client()
    with TestClient(off) as client:
        assert client.get("/runs/status", headers=_auth(off_settings)).json()["scheduler"] == {"enabled": False}


def test_scheduler_setting_defaults():
    assert Settings(_env_file=None).scheduler_on is False
    assert Settings(_env_file=None, scheduler_enabled=True).scheduler_on is True
    production = Settings(_env_file=None, app_env="production", shop_api_token="a", web_events_secret="b",
                          signing_secret="c", agent_actor_secret="x" * 32, database_url="postgresql://u:p@h/d")
    assert production.scheduler_on is True
    with pytest.raises(ValueError, match="at least 1"):
        Settings(_env_file=None, scheduler_interval_minutes=0)


def test_the_waiting_improvements_are_what_a_run_leaves():
    app, _, settings = _client()
    response = TestClient(app).post("/runs", headers=_auth(settings))
    assert response.status_code == 202
    assert {s for s in response.json()["advanced"].values()} == {ImprovementStatus.AWAITING_HUMAN.value}


def test_an_empty_scheduler_variable_means_unset(monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "")
    assert Settings(_env_file=None).scheduler_enabled is None
