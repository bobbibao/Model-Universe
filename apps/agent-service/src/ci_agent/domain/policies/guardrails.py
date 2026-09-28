"""Guardrails (Specification pattern): every rule returns a violation message or None.

Applied in Improve (before Act). Act re-verifies the plan hash. Rules are small,
independent and composable via GuardrailEngine.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan, PlannedAction


@dataclass(frozen=True)
class GuardrailConfig:
    max_discount_pct: float = 40.0
    max_skus_per_plan: int = 200
    max_plan_cost: float = 5000.0


class GuardrailRule(Protocol):
    def check(self, plan: ActionPlan, directive: Directive) -> str | None: ...


def action_skus(action: PlannedAction) -> set[str]:
    skus = set(action.params.get("skus", []))
    if "sku" in action.params:
        skus.add(action.params["sku"])
    return skus


class PlanWithinDirective:
    """The plan must stay inside what the human authorised."""

    def check(self, plan: ActionPlan, directive: Directive) -> str | None:
        if plan.strategy != directive.strategy:
            return f"Plan strategy {plan.strategy!r} differs from approved {directive.strategy!r}"
        scope = set(directive.sku_scope)
        for action in plan.actions:
            outside = action_skus(action) - scope
            if outside:
                return f"Action {action.type} touches SKUs outside the approved scope: {sorted(outside)[:3]}"
            pct = action.params.get("percent")
            cap = directive.limits.get("max_discount_pct")
            if action.type == "apply_discount" and cap is not None and pct is not None and pct > cap:
                return f"Discount {pct:g}% exceeds the approved maximum {cap:g}%"
        budget = directive.limits.get("budget_cap")
        if budget is not None and plan.estimated_cost > budget:
            return f"Estimated cost {plan.estimated_cost:.2f} exceeds the approved budget {budget:.2f}"
        return None


class MaxDiscount:
    def __init__(self, max_pct: float) -> None:
        self.max_pct = max_pct

    def check(self, plan: ActionPlan, directive: Directive) -> str | None:
        for a in plan.actions:
            if a.type == "apply_discount" and a.params.get("percent", 0) > self.max_pct:
                return f"Discount above the global limit of {self.max_pct:g}%"
        return None


class MaxSkuBlastRadius:
    def __init__(self, max_skus: int) -> None:
        self.max_skus = max_skus

    def check(self, plan: ActionPlan, directive: Directive) -> str | None:
        touched: set[str] = set()
        for a in plan.actions:
            touched |= action_skus(a)
        if len(touched) > self.max_skus:
            return f"Plan touches {len(touched)} SKUs, above the limit of {self.max_skus}"
        return None


class MaxPlanCost:
    def __init__(self, max_cost: float) -> None:
        self.max_cost = max_cost

    def check(self, plan: ActionPlan, directive: Directive) -> str | None:
        if plan.estimated_cost > self.max_cost:
            return f"Estimated cost {plan.estimated_cost:.2f} above the global limit {self.max_cost:.2f}"
        return None


class GuardrailEngine:
    def __init__(self, rules: Sequence[GuardrailRule]) -> None:
        self._rules = list(rules)

    def violations(self, plan: ActionPlan, directive: Directive) -> list[str]:
        return [msg for rule in self._rules if (msg := rule.check(plan, directive))]


def default_engine(config: GuardrailConfig | None = None) -> GuardrailEngine:
    cfg = config or GuardrailConfig()
    return GuardrailEngine([PlanWithinDirective(), MaxDiscount(cfg.max_discount_pct),
                            MaxSkuBlastRadius(cfg.max_skus_per_plan), MaxPlanCost(cfg.max_plan_cost)])
