from __future__ import annotations

from typing import Any

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies._common import (cost_basis, is_expired, measurement_plan_for,
                                                retail_value, signal_items)
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext
from ci_agent.domain.strategies.registry import register_strategy


def sell_through(percent: float) -> float:
    return min(0.85, 0.25 + 0.015 * percent)


@register_strategy
class DiscountStrategy(ImprovementStrategy):
    name = "discount"
    title = "Time-limited discount"
    _kinds = frozenset({"dead_stock", "near_expiry"})

    def applies_to(self, signal: Signal) -> bool:
        return signal.kind in self._kinds

    def _eligible(self, signal: Signal, ctx: StrategyContext):
        return [i for i in signal_items(signal, ctx) if i.condition != "damaged" and not is_expired(i, ctx.now)]

    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        items = self._eligible(signal, ctx)
        if not items:
            return None
        pct = 30.0 if signal.kind == "near_expiry" else 20.0
        st = sell_through(pct)
        return OptionPreview(
            option_id=self.name, strategy=self.name,
            title=f"{pct:g}% discount on {len(items)} SKUs",
            params={"percent": pct, "duration_days": 14},
            est_recovery_value=round(retail_value(items) * (1 - pct / 100) * st, 2),
            est_cost=0.0,
            est_waste_reduction=round(cost_basis(items) * st, 2),
            risk="low" if pct <= 30 else "medium",
            assumptions=(f"Estimated sell-through {st:.0%} during the promotion",),
        )

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        pct = params.get("percent")
        if not isinstance(pct, (int, float)) or not 1 <= pct <= 90:
            return ["percent must be a number between 1 and 90"]
        return []

    def derive_limits(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"max_discount_pct": float(params["percent"])}

    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        scope = set(directive.sku_scope)
        skus = [i.sku for i in self._eligible(signal, ctx) if i.sku in scope]
        if not skus:
            raise RuleViolation("No eligible SKUs remain for a discount")
        pct = float(directive.params["percent"])
        days = int(directive.params.get("duration_days", 14))
        actions = (
            PlannedAction("apply_discount", {"skus": skus, "percent": pct, "duration_days": days},
                          f"Apply {pct:g}% discount to {len(skus)} SKUs for {days} days"),
            PlannedAction("create_task", {"title": "Give discounted SKUs prominent placement",
                                          "assignee_role": "merchandiser",
                                          "description": f"Feature {len(skus)} discounted SKUs on the homepage",
                                          "due_in_days": 2}, "Create merchandising task"),
        )
        return ActionPlan.create(self.name, actions, measurement_plan_for(signal.kind), 0.0)
