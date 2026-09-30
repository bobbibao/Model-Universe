"""Runs of the loop (ROADMAP T-09): one at a time, from the scheduler or the manual button, with live progress.

- `RunManager.run` never overlaps: a second caller gets `None` straight away instead of waiting (the button answers
  409, the scheduler skips that turn). A tick with a slow LLM just takes longer; nothing piles up behind it.
- Progress (`run_started`, `detected`, `advanced`, `run_finished`, `run_failed`) goes to subscribers, e.g. the SSE
  endpoint; a failing subscriber is dropped, it never affects the run.
- `TickScheduler` calls `run("scheduler")` every `interval_s` *after the previous run ended* (fixed delay), catches
  everything a run can raise (one bad run never stops the scheduler; one bad improvement never stops a run, see
  WorkflowCoordinator.tick), and stops cleanly: `stop()` wakes it, waits for a run in progress up to a timeout, then
  gives up (a run interrupted by the process exiting resumes safely on the next start, see docs/AUTONOMOUS_LOG.md 1a).
"""
from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from ci_agent.application.workflow import ProgressCallback, TickReport

logger = logging.getLogger(__name__)

Event = dict[str, Any]
Subscriber = Callable[[Event], None]
Tick = Callable[[ProgressCallback], TickReport]


def _now() -> datetime:
    return datetime.now(UTC)


class RunManager:
    def __init__(self, tick: Tick, now: Callable[[], datetime] = _now) -> None:
        self._tick, self._now = tick, now
        self._run_lock = threading.Lock()  # held for the whole run: the no-overlap guarantee
        self._state_lock = threading.Lock()  # guards the fields below and the subscribers
        self._subscribers: dict[int, Subscriber] = {}
        self._next_id = 0
        self._current: dict[str, Any] | None = None
        self._last: dict[str, Any] | None = None
        self.scheduler: dict[str, Any] = {"enabled": False}
        self.demo: dict[str, Any] = {}

    # ------------------------------------------------------------------------------------------ subscribers
    def subscribe(self, subscriber: Subscriber) -> int:
        with self._state_lock:
            self._next_id += 1
            self._subscribers[self._next_id] = subscriber
            return self._next_id

    def unsubscribe(self, token: int) -> None:
        with self._state_lock:
            self._subscribers.pop(token, None)

    def _publish(self, event: str, data: dict[str, Any]) -> None:
        message = {"event": event, "at": self._now().isoformat(), **data}
        with self._state_lock:
            subscribers = list(self._subscribers.items())
        for token, subscriber in subscribers:
            try:
                subscriber(message)
            except Exception:  # noqa: BLE001 - a broken subscriber is dropped, the run goes on
                self.unsubscribe(token)

    # --------------------------------------------------------------------------------------------------- runs
    def run(self, trigger: str) -> TickReport | None:
        """Run one tick; `None` when another run is in progress (it is not queued)."""
        if not self._run_lock.acquire(blocking=False):
            return None
        started = self._now()
        try:
            with self._state_lock:
                self._current = {"trigger": trigger, "started_at": started.isoformat(), "done": 0, "total": None}
            self._publish("run_started", {"trigger": trigger})
            try:
                report = self._tick(self._on_progress)
            except Exception as exc:
                self._finish(trigger, started, None, f"{type(exc).__name__}: {exc}")
                raise
            self._finish(trigger, started, report, None)
            return report
        finally:
            with self._state_lock:
                self._current = None
            self._run_lock.release()

    def busy(self) -> dict[str, Any] | None:
        with self._state_lock:
            return dict(self._current) if self._current else None

    def status(self) -> dict[str, Any]:
        with self._state_lock:
            return {"running": dict(self._current) if self._current else None,
                    "last_run": dict(self._last) if self._last else None,
                    "scheduler": dict(self.scheduler), "demo": dict(self.demo)}

    def _on_progress(self, event: str, data: dict[str, Any]) -> None:
        with self._state_lock:
            if self._current is not None:
                if event == "detected":
                    self._current["total"] = data.get("to_advance")
                elif event == "advanced":
                    self._current["done"] = data.get("done")
        self._publish(event, data)

    def _finish(self, trigger: str, started: datetime, report: TickReport | None, error: str | None) -> None:
        finished = self._now()
        summary: dict[str, Any] = {"trigger": trigger, "started_at": started.isoformat(),
                                   "finished_at": finished.isoformat(),
                                   "seconds": round((finished - started).total_seconds(), 1), "error": error}
        if report is not None:
            summary.update(detected=len(report.detected), expired=len(report.expired),
                           advanced=len(report.advanced), errors=len(report.errors), skipped=len(report.skipped))
        with self._state_lock:
            self._last = summary
        self._publish("run_failed" if error else "run_finished", summary)


class TickScheduler:
    def __init__(self, runs: RunManager, interval_s: float, now: Callable[[], datetime] = _now) -> None:
        if interval_s <= 0:
            raise ValueError("interval_s must be positive")
        self._runs, self._interval_s, self._now = runs, interval_s, now
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.skipped = 0  # turns skipped because a run (e.g. a manual one) was already in progress

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="ci-agent-scheduler", daemon=True)
        self._set_next()
        self._thread.start()
        logger.info("Scheduler started: a run every %s s (after the previous one ends)", self._interval_s)

    def stop(self, timeout_s: float = 10.0) -> bool:
        """Stop; True when the scheduler thread ended within `timeout_s` (False: a run is still going)."""
        self._stop.set()
        if self._thread is None:
            return True
        self._thread.join(timeout_s)
        stopped = not self._thread.is_alive()
        if not stopped:
            logger.warning("Scheduler stop: a run is still in progress after %s s; it ends with the process and "
                           "resumes safely on the next start.", timeout_s)
        return stopped

    def _set_next(self) -> None:
        self._runs.scheduler = {"enabled": True, "interval_seconds": self._interval_s,
                                "next_run_at": (self._now() + timedelta(seconds=self._interval_s)).isoformat()}

    def _loop(self) -> None:
        while not self._stop.wait(self._interval_s):
            try:
                if self._runs.run("scheduler") is None:
                    self.skipped += 1
                    logger.info("Scheduled run skipped: another run is in progress")
            except Exception:  # one failed run must not stop the scheduler
                logger.exception("Scheduled run failed; the next one runs as planned")
            self._set_next()
        self._runs.scheduler = {"enabled": False}
