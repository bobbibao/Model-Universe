"""Who may approve what (role-based, from SOP-001: discounts above 30% need a manager)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.notification import ROLE_RANK, Role


@dataclass(frozen=True)
class ApproverPolicy:
    manager_discount_threshold_pct: float = 30.0
    manager_cost_threshold: float = 1000.0

    def required_role(self, strategy: str, params: dict[str, Any], est_cost: float) -> Role:
        pct = params.get("percent", params.get("bundle_discount_pct", 0))
        if pct > self.manager_discount_threshold_pct or est_cost > self.manager_cost_threshold:
            return Role.MANAGER
        return Role.STAFF

    def minimum_role(self, options: Sequence[OptionPreview]) -> Role:
        """The lowest role that may approve at least one option."""
        roles = [self.required_role(o.strategy, o.params, o.est_cost) for o in options]
        return min(roles, key=lambda r: ROLE_RANK[r]) if roles else Role.STAFF
