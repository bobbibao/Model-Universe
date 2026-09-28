from __future__ import annotations

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies._common import cost_basis, measurement_plan_for, retail_value, signal_items
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext
from ci_agent.domain.strategies.registry import register_strategy


@register_strategy
class OutletStrategy(ImprovementStrategy):
    name = "outlet"
    title = "Move to outlet channel"

    def applies_to(self, signal: Signal) -> bool:
        return signal.kind in {"dead_stock", "high_returns"}

    def _eligible(self, signal: Signal, ctx: StrategyContext):
        return [i for i in signal_items(signal, ctx)
                if i.channel != "outlet" and i.condition != "damaged"
                and (i.days_in_stock >= 180 or i.condition == "open_box")]

    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        items = self._eligible(signal, ctx)
        if not items:
            return None
        revenue = retail_value(items) * 0.5 * 0.6
        return OptionPreview(
            option_id=self.name, strategy=self.name,
            title=f"Move {len(items)} SKUs to the outlet channel",
            params={"to_channel": "outlet"},
            est_recovery_value=round(revenue, 2), est_cost=round(revenue * 0.08, 2),
            est_waste_reduction=round(cost_basis(items) * 0.6, 2), risk="low",
            assumptions=("Outlet price is ~50% of retail with 60% sell-through", "8% channel fee"),
        )

    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        scope = set(directive.sku_scope)
        skus = [i.sku for i in self._eligible(signal, ctx) if i.sku in scope]
        if not skus:
            raise RuleViolation("No SKUs are eligible for the outlet channel")
        actions = (PlannedAction("switch_channel", {"skus": skus, "to_channel": "outlet"},
                                 f"Move {len(skus)} SKUs to the outlet channel"),)
        return ActionPlan.create(self.name, actions, measurement_plan_for(signal.kind), 0.0)
