from __future__ import annotations

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies._common import measurement_plan_for
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext
from ci_agent.domain.strategies.registry import register_strategy


@register_strategy
class RepackageStrategy(ImprovementStrategy):
    name = "repackage"
    title = "Repackage and restock returned items"

    def applies_to(self, signal: Signal) -> bool:
        return signal.kind == "high_returns"

    def _eligible(self, signal: Signal, ctx: StrategyContext):
        skus = set(signal.subject_skus)
        return [r for r in ctx.snapshot.returns if r.sku in skus and r.condition in ("new", "open_box")]

    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        returns = self._eligible(signal, ctx)
        if not returns:
            return None
        refunds = sum(r.refund_amount for r in returns)
        return OptionPreview(
            option_id=self.name, strategy=self.name,
            title=f"Repackage and restock {len(returns)} returned units",
            params={"units": len(returns)},
            est_recovery_value=round(refunds * 0.7, 2), est_cost=round(2.0 * len(returns), 2),
            est_waste_reduction=round(refunds * 0.5, 2), risk="low",
            assumptions=("70% of refund value recovered on resale", "2.00 repackaging labour per unit"),
        )

    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        scope = set(directive.sku_scope)
        skus = sorted({r.sku for r in self._eligible(signal, ctx) if r.sku in scope})
        if not skus:
            raise RuleViolation("No returned units are eligible for repackaging")
        actions = [PlannedAction("create_task", {"title": "Repackage returned units",
                                                 "assignee_role": "warehouse",
                                                 "description": f"Repackage returned units for {len(skus)} SKUs (SOP-002)",
                                                 "due_in_days": 3}, "Create repackaging task")]
        actions += [PlannedAction("adjust_inventory", {"sku": s, "new_status": "restock",
                                                       "reason": "repackaged return"}, f"Restock {s}") for s in skus]
        return ActionPlan.create(self.name, actions, measurement_plan_for(signal.kind),
                                 round(2.0 * len(self._eligible(signal, ctx)), 2))
