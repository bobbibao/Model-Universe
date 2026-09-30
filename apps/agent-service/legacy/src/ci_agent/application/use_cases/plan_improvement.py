"""Phase 4 - Improve: compile the human's directive into a concrete, guardrail-checked action plan."""
from __future__ import annotations

from dataclasses import dataclass

from ci_agent.application.errors import NotFoundError
from ci_agent.application.ports.repositories import ImprovementRepository
from ci_agent.application.ports.shop import ShopReadPort
from ci_agent.application.ports.system import ClockPort
from ci_agent.application.services.recorder import Recorder
from ci_agent.domain.errors import DomainError
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.policies.guardrails import GuardrailEngine
from ci_agent.domain.strategies.base import StrategyContext
from ci_agent.domain.strategies.registry import get_strategy


@dataclass(frozen=True)
class PlanResult:
    planned: bool
    violations: tuple[str, ...] = ()


class PlanImprovement:
    def __init__(self, shop: ShopReadPort, guardrails: GuardrailEngine, repo: ImprovementRepository,
                 recorder: Recorder, clock: ClockPort, money: MoneyFormat | None = None) -> None:
        self._shop, self._guardrails, self._repo = shop, guardrails, repo
        self._recorder, self._clock, self._money = recorder, clock, money or MoneyFormat()

    def execute(self, improvement_id: str) -> PlanResult:
        imp = self._repo.get(improvement_id)
        if imp is None or imp.directive is None:
            raise NotFoundError(improvement_id)
        now = self._clock.now()
        strategy = get_strategy(imp.directive.strategy)
        try:
            plan = strategy.plan(imp.signal, imp.directive,
                                 StrategyContext(snapshot=self._shop.snapshot(), now=now, money=self._money))
            violations = self._guardrails.violations(plan, imp.directive)
        except DomainError as exc:
            plan, violations = None, [str(exc)]
        if violations or plan is None:
            self._recorder.log("agent", "plan_rejected_by_guardrails", imp.id, {"violations": list(violations)})
            return PlanResult(False, tuple(violations))
        imp.attach_plan(plan, now)
        self._recorder.commit(imp, "agent", "planned", {"plan_hash": plan.plan_hash[:12],
                                                        "actions": [a.type for a in plan.actions]})
        return PlanResult(True)
