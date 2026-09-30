"""Phase 5 - Act: capture the KPI baseline, run the approved plan, roll back on failure.

Measurement is due after the plan's own window (`MeasurementPlan.evaluate_after_days`, a domain constant). A demo
deployment may pass `demo_measure_after` to measure sooner; it changes only when Measure runs, never the plan, its
KPIs or thresholds, and bootstrap refuses it in production (docs/AUTONOMOUS_LOG.md, phase 1b).
"""
from __future__ import annotations

from datetime import timedelta

from ci_agent.application.errors import NotFoundError
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.shop import ShopReadPort
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.command_executor import CommandExecutor
from ci_agent.application.services.notification_service import NotificationService
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.kpi import KPI_CATALOG
from ci_agent.domain.models.improvement import ImprovementStatus


class ExecutePlan:
    def __init__(self, shop: ShopReadPort, executor: CommandExecutor, repo: ImprovementRepository,
                 recorder: Recorder, notifier: NotificationService, clock: ClockPort,
                 max_attempts: int = 2, demo_measure_after: timedelta | None = None) -> None:
        self._shop, self._executor, self._repo = shop, executor, repo
        self._recorder, self._notifier, self._clock, self._max_attempts = recorder, notifier, clock, max_attempts
        self._demo_measure_after = demo_measure_after

    def execute(self, improvement_id: str) -> None:
        imp = self._repo.get(improvement_id)
        if imp is None or imp.plan is None:
            raise NotFoundError(improvement_id)
        now = self._clock.now()
        if imp.status is ImprovementStatus.ACT_FAILED and imp.action_attempts >= self._max_attempts:
            imp.abandon_action(now)
            self._recorder.commit(imp, "agent", "action_abandoned", {"attempts": imp.action_attempts})
            return

        imp.start_action(self._shop.kpis(list(KPI_CATALOG)), now)  # verifies plan hash, captures baseline
        outcome = self._executor.execute(imp.id, imp.plan, imp.action_attempts, imp.action_records)
        imp.record_actions(outcome.records)
        if outcome.ok:
            imp.mark_acted(now)
            window = timedelta(days=imp.plan.measurement_plan.evaluate_after_days)
            if self._demo_measure_after is not None:
                window = self._demo_measure_after
            due = now + window
            imp.start_measuring(due, now)
            detail = {"steps": len(outcome.records), "measure_due_at": due.isoformat()}
            if self._demo_measure_after is not None:
                detail["demo_measure_after_minutes"] = window.total_seconds() / 60
            self._recorder.commit(imp, "agent", "acted", detail)
            self._notifier.action_executed(imp)
        else:
            imp.fail_action(outcome.error or "unknown error", now)
            self._recorder.commit(imp, "agent", "action_failed", {"error": outcome.error})
            self._notifier.action_failed(imp, outcome.error or "unknown error")
