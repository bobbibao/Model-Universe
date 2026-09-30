"""Turn an approving answer into a Directive (bounded authority)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from ci_agent.domain.errors import RuleViolation
from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.strategies.base import ImprovementStrategy


def merge_params(option: OptionPreview, overrides: dict[str, Any]) -> dict[str, Any]:
    unknown = set(overrides) - set(option.params)
    if unknown:
        raise RuleViolation(f"Unknown parameter(s) for {option.strategy}: {sorted(unknown)}")
    return {**option.params, **overrides}


def build_directive(strategy: ImprovementStrategy, option: OptionPreview, overrides: dict[str, Any],
                    sku_scope: tuple[str, ...], approved_by: str, now: datetime,
                    auto_approved: bool = False) -> Directive:
    params = merge_params(option, overrides)
    errors = strategy.validate_params(params)
    if errors:
        raise RuleViolation("; ".join(errors))
    limits = {**strategy.derive_limits(params), "budget_cap": max(option.est_cost * 1.25, 50.0)}
    return Directive(strategy=strategy.name, option_id=option.option_id, params=params, limits=limits,
                     sku_scope=sku_scope, approved_by=approved_by, approved_at=now,
                     auto_approved=auto_approved)
