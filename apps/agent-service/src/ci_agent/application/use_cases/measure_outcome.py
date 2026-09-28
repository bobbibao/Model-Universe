"""Phase 6 - Measure: compare KPIs with the baseline once the evaluation window has passed."""
from __future__ import annotations

from ci_agent.application.errors import NotFoundError
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.shop import ShopReadPort
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.notification_service import NotificationService
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.services.measurement_evaluator import evaluate


class MeasureOutcome:
    def __init__(self, shop: ShopReadPort, repo: ImprovementRepository, recorder: Recorder,
                 notifier: NotificationService, clock: ClockPort) -> None:
        self._shop, self._repo, self._recorder = shop, repo, recorder
        self._notifier, self._clock = notifier, clock

    def execute(self, improvement_id: str) -> bool:
        """Return True when a measurement was recorded, False when it is not due yet."""
        imp = self._repo.get(improvement_id)
        if imp is None or imp.plan is None:
            raise NotFoundError(improvement_id)
        now = self._clock.now()
        if not imp.is_measurement_due(now):
            return False
        plan = imp.plan.measurement_plan
        current = self._shop.kpis(list(plan.kpis))
        result = evaluate(plan, imp.baseline, current, now)
        imp.record_measurement(result, now)
        self._recorder.commit(imp, "agent", "measured", {"verdict": result.verdict.value, "summary": result.summary})
        self._notifier.measurement_ready(imp)
        return True
