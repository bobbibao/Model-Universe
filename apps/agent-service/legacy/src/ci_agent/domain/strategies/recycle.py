from __future__ import annotations

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies._common import (cost_basis, is_expired, measurement_plan_for,
                                                signal_items, unit_count)
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext
from ci_agent.domain.strategies.registry import register_strategy


@register_strategy
class RecycleStrategy(ImprovementStrategy):
    name = "recycle"
    title = "Recycle or dispose"

    def applies_to(self, signal: Signal) -> bool:
        return signal.kind in {"dead_stock", "near_expiry"}

    def _eligible(self, signal: Signal, ctx: StrategyContext):
        return [i for i in signal_items(signal, ctx) if i.condition == "damaged" or is_expired(i, ctx.now)]

    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        items = self._eligible(signal, ctx)
        if not items:
            return None
        return OptionPreview(
            option_id=self.name, strategy=self.name,
            title=f"Recycle {unit_count(items)} damaged or expired units",
            params={},
            est_recovery_value=round(cost_basis(items) * 0.05, 2),
            est_cost=round(0.3 * unit_count(items), 2),
            est_waste_reduction=round(cost_basis(items) * 0.95, 2), risk="medium",
            assumptions=("Salvage value ~5% of cost basis", "Disposal follows local regulations"),
        )

    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        scope = set(directive.sku_scope)
        items = [i for i in self._eligible(signal, ctx) if i.sku in scope]
        if not items:
            raise RuleViolation("No damaged or expired SKUs remain for recycling")
        actions = [PlannedAction("create_task", {"title": "Recycle damaged or expired stock",
                                                 "assignee_role": "warehouse",
                                                 "description": f"Recycle {unit_count(items)} units",
                                                 "due_in_days": 7}, "Create recycling task")]
        actions += [PlannedAction("adjust_inventory", {"sku": i.sku, "new_status": "recycle",
                                                       "reason": "damaged or expired"}, f"Quarantine {i.sku}")
                    for i in items]
        return ActionPlan.create(self.name, actions, measurement_plan_for(signal.kind),
                                 round(0.3 * unit_count(items), 2))
