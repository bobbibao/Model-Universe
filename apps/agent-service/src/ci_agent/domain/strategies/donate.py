from __future__ import annotations

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies._common import cost_basis, measurement_plan_for, signal_items, unit_count
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext
from ci_agent.domain.strategies.registry import register_strategy


@register_strategy
class DonateStrategy(ImprovementStrategy):
    name = "donate"
    title = "Donate to a partner charity"

    def applies_to(self, signal: Signal) -> bool:
        return signal.kind in {"dead_stock", "near_expiry"}

    def _eligible(self, signal: Signal, ctx: StrategyContext):
        return [i for i in signal_items(signal, ctx) if i.condition != "damaged"]

    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        items = self._eligible(signal, ctx)
        if not items:
            return None
        return OptionPreview(
            option_id=self.name, strategy=self.name,
            title=f"Donate {unit_count(items)} units across {len(items)} SKUs",
            params={},
            est_recovery_value=round(cost_basis(items) * 0.1, 2),
            est_cost=round(0.5 * unit_count(items), 2),
            est_waste_reduction=round(cost_basis(items) * 0.9, 2), risk="low",
            assumptions=("Tax benefit of ~10% of cost basis (verify with finance)", "0.50 logistics per unit"),
        )

    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        scope = set(directive.sku_scope)
        items = [i for i in self._eligible(signal, ctx) if i.sku in scope]
        if not items:
            raise RuleViolation("No eligible SKUs remain for donation")
        actions = [PlannedAction("create_task", {"title": "Arrange donation pickup",
                                                 "assignee_role": "logistics",
                                                 "description": f"Donate {unit_count(items)} units",
                                                 "due_in_days": 7}, "Create donation logistics task")]
        actions += [PlannedAction("adjust_inventory", {"sku": i.sku, "new_status": "donation_pending",
                                                       "reason": "approved donation"}, f"Reserve {i.sku}")
                    for i in items]
        return ActionPlan.create(self.name, actions, measurement_plan_for(signal.kind),
                                 round(0.5 * unit_count(items), 2))
