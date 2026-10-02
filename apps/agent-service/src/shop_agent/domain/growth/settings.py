"""The owner's business controls as the agent reads them (`analytics.agent_settings`, edited on /admin/agent/settings).

Keys, value shapes and defaults are the web's (apps/web-ecommerce AgentSettingDefinitions.ts), pinned by
packages/contracts/test-vectors/agent-settings.json. A key without a row takes its default.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from shop_agent.domain.actions import GROWTH_CAPABILITIES
from shop_agent.domain.capabilities import Capability
from shop_agent.domain.policies.autonomy import AutonomyMode, AutonomySettings


class _Value(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class GrowthGoal(_Value):
    revenue_target_vnd: int | Literal["auto"] = "auto"
    margin_floor_pct: float = 15
    max_spend_ratio_pct: float = 8


class GrowthCaps(_Value):
    monthly_ad_cap_vnd: int | Literal["auto"] = "auto"
    per_campaign_vnd: int = 3_000_000
    per_day_vnd: int = 500_000


class TrendKeyword(_Value):
    keyword: str
    category: str | None = None


DEFAULT_AUTONOMY: dict[Capability, AutonomyMode] = {
    Capability.PROMOTION: AutonomyMode.ASK,
    Capability.FACEBOOK_POST: AutonomyMode.SHADOW,
    Capability.ADS_META: AutonomyMode.SHADOW,
    Capability.ADS_GOOGLE: AutonomyMode.SHADOW,
    Capability.ADS_TIKTOK: AutonomyMode.SHADOW,
    Capability.INVENTORY: AutonomyMode.ASK,
    Capability.OPS_TASKS: AutonomyMode.ASK,
}

# Setting key -> field of GrowthSettings.
SETTING_KEYS: dict[str, str] = {
    "growth.enabled": "growth_enabled",
    "growth.goal": "goal",
    "growth.caps": "caps",
    "autonomy": "autonomy",
    "brand.approved": "brand_approved",
    "approvals.high.two_person": "two_person_approval",
    "market.trend_keywords": "trend_keywords",
}


class GrowthSettings(_Value):
    growth_enabled: bool = True  # the kill switch
    goal: GrowthGoal = GrowthGoal()
    caps: GrowthCaps = GrowthCaps()
    autonomy: dict[Capability, AutonomyMode] = Field(default_factory=lambda: dict(DEFAULT_AUTONOMY))
    brand_approved: bool = False
    two_person_approval: bool = False
    trend_keywords: tuple[TrendKeyword, ...] = ()

    @classmethod
    def from_values(cls, values: Mapping[str, Any]) -> GrowthSettings:
        """From `{setting key: value}` (the view's rows); unknown keys are ignored, missing keys take defaults."""
        fields = {SETTING_KEYS[key]: value for key, value in values.items() if key in SETTING_KEYS}
        return cls.model_validate(fields)

    def as_values(self) -> dict[str, Any]:
        """Back to `{setting key: value}` in the stored (JSON) form."""
        dumped = self.model_dump(mode="json")
        return {key: dumped[field] for key, field in SETTING_KEYS.items()}

    def autonomy_settings(self) -> AutonomySettings:
        """The modes the agent acts under. Brand gate: growth capabilities stay in shadow (or off) until the owner
        has approved the brand guide, so no copy is published against an unreviewed brand."""
        modes = dict(self.autonomy)
        if not self.brand_approved:
            for capability in GROWTH_CAPABILITIES:
                if modes.get(capability, AutonomyMode.ASK) is not AutonomyMode.OFF:
                    modes[capability] = AutonomyMode.SHADOW
        return AutonomySettings(modes=modes)
