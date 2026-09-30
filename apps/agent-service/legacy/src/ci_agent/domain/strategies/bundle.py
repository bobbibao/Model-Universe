from __future__ import annotations

from typing import Any

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction
from ci_agent.domain.models.signal import Signal
from ci_agent.domain.strategies._common import (cost_basis, measurement_plan_for, retail_value,
                                                signal_items, unit_count)
from ci_agent.domain.strategies.base import ImprovementStrategy, StrategyContext
from ci_agent.domain.strategies.registry import register_strategy


@register_strategy
class BundleStrategy(ImprovementStrategy):
    name = "bundle"
    title = "Bundle with a best seller"

    def applies_to(self, signal: Signal) -> bool:
        return signal.kind == "dead_stock"

    def _anchor(self, signal: Signal, ctx: StrategyContext) -> str | None:
        in_scope = set(signal.subject_skus)
        candidates = [i for i in ctx.snapshot.stock if i.sku not in in_scope and i.quantity > 0]
        if not candidates:
            return None
        best = max(candidates, key=lambda i: ctx.snapshot.velocity(i.sku))
        return best.sku if ctx.snapshot.velocity(best.sku) > 0.5 else None

    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        items = [i for i in signal_items(signal, ctx) if i.condition != "damaged"]
        anchor = self._anchor(signal, ctx)
        if not items or anchor is None:
            return None
        return OptionPreview(
            option_id=self.name, strategy=self.name,
            title=f"Bundle {len(items)} SKUs with best seller {anchor}",
            params={"anchor_sku": anchor, "bundle_discount_pct": 25.0},
            est_recovery_value=round(retail_value(items) * 0.75 * 0.5, 2),
            est_cost=round(0.5 * unit_count(items), 2),
            est_waste_reduction=round(cost_basis(items) * 0.5, 2), risk="low",
            assumptions=("50% of bundled units sell", f"{ctx.money.text(0.5, '.2f')} packaging cost per unit"),
        )

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        pct = params.get("bundle_discount_pct")
        if not isinstance(pct, (int, float)) or not 1 <= pct <= 60:
            return ["bundle_discount_pct must be between 1 and 60"]
        return []

    def derive_limits(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"max_discount_pct": float(params["bundle_discount_pct"])}

    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        scope = set(directive.sku_scope)
        skus = [i.sku for i in signal_items(signal, ctx) if i.sku in scope and i.condition != "damaged"]
        if not skus:
            raise RuleViolation("No eligible SKUs remain for bundling")
        pct = float(directive.params["bundle_discount_pct"])
        anchor = directive.params["anchor_sku"]
        actions = (
            PlannedAction("create_task", {"title": f"Create bundle listing with {anchor}",
                                          "assignee_role": "merchandiser",
                                          "description": f"Bundle {len(skus)} slow SKUs with {anchor}",
                                          "due_in_days": 3}, "Create bundle listing task"),
            PlannedAction("apply_discount", {"skus": skus, "percent": pct, "duration_days": 21},
                          f"Apply {pct:g}% bundle discount"),
        )
        return ActionPlan.create(self.name, actions, measurement_plan_for(signal.kind),
                                 round(0.5 * sum(i.quantity for i in signal_items(signal, ctx)
                                                 if i.sku in scope), 2))
