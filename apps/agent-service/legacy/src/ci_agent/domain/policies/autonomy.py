"""Autonomy policy: when may the agent approve on the human's behalf?"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from ci_agent.domain.models.finding import OptionPreview
from ci_agent.domain.models.signal import Severity


class ApprovalMode(str, Enum):
    ALWAYS_ASK = "always_ask"
    AUTO_LOW_RISK = "auto_low_risk"


@dataclass(frozen=True)
class AutonomyPolicy:
    mode: ApprovalMode = ApprovalMode.ALWAYS_ASK
    max_auto_cost: float = 200.0

    def can_auto_approve(self, option: OptionPreview, severity: Severity) -> bool:
        return (self.mode is ApprovalMode.AUTO_LOW_RISK
                and option.risk == "low"
                and option.est_cost <= self.max_auto_cost
                and severity in (Severity.LOW, Severity.MEDIUM))
