"""Strategy pattern for Investigate previews and Improve plans.

`preview` and `plan` are deterministic. The LLM never invents numbers; it only
explains them. Add a strategy = add one file and decorate with @register_strategy.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any, ClassVar

from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.human import Directive
from ci_agent.domain.models.plan import ActionPlan
from ci_agent.domain.models.shop import ShopSnapshot
from ci_agent.domain.models.signal import Signal


@dataclass(frozen=True)
class StrategyContext:
    snapshot: ShopSnapshot
    now: datetime
    sop_notes: tuple[str, ...] = ()


class ImprovementStrategy(ABC):
    name: ClassVar[str]
    title: ClassVar[str]

    @abstractmethod
    def applies_to(self, signal: Signal) -> bool: ...

    @abstractmethod
    def preview(self, signal: Signal, ctx: StrategyContext) -> OptionPreview | None:
        """Estimate this option for the Ask phase. Return None when it is not viable."""

    @abstractmethod
    def plan(self, signal: Signal, directive: Directive, ctx: StrategyContext) -> ActionPlan:
        """Compile the human-approved directive into concrete actions (Improve phase)."""

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        """Return human-readable errors for invalid (possibly human-edited) parameters."""
        return []

    def derive_limits(self, params: dict[str, Any]) -> dict[str, Any]:
        """Hard limits the plan must respect, derived from the approved parameters."""
        return {}
