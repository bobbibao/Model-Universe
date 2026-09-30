"""Bounded autonomy (ADR-0006, ADR-0011): may an option run without asking a person?

Per capability the owner sets a mode: `off` (never proposed), `shadow` (planned and recorded, never run), `ask`
(always a person) or `auto_low` (low-tier actions run without asking). The web enforces the same rule on every write.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum

from shop_agent.domain.capabilities import TIER_RANK, Capability, RiskTier


class AutonomyMode(StrEnum):
    OFF = "off"
    SHADOW = "shadow"
    ASK = "ask"
    AUTO_LOW = "auto_low"


class Route(StrEnum):
    AUTO = "auto"  # runs without asking
    ASK = "ask"  # interrupt: a person decides
    SHADOW = "shadow"  # recorded, never run
    BLOCKED = "blocked"  # not allowed at all


@dataclass(frozen=True)
class AutonomySettings:
    modes: Mapping[Capability, AutonomyMode] = field(default_factory=dict)
    default_mode: AutonomyMode = AutonomyMode.ASK

    def mode(self, capability: Capability) -> AutonomyMode:
        return self.modes.get(capability, self.default_mode)


def route(
    actions: Sequence[tuple[Capability, RiskTier]], settings: AutonomySettings, *, needs_human: bool = False
) -> tuple[Route, str]:
    """How an option proceeds, and why."""
    if not actions:
        return Route.ASK, "no action to run"
    if any(tier is RiskTier.BLOCKED for _, tier in actions):
        return Route.BLOCKED, "an action is blocked by a limit"
    modes = {capability: settings.mode(capability) for capability, _ in actions}
    off = sorted(c.value for c, m in modes.items() if m is AutonomyMode.OFF)
    if off:
        return Route.BLOCKED, f"capability switched off: {', '.join(off)}"
    shadow = sorted(c.value for c, m in modes.items() if m is AutonomyMode.SHADOW)
    if shadow:
        return Route.SHADOW, f"capability in shadow mode: {', '.join(shadow)}"
    if needs_human:
        return Route.ASK, "a check asked for a person"
    all_low = all(TIER_RANK[tier] <= TIER_RANK[RiskTier.LOW] for _, tier in actions)
    all_auto = all(m is AutonomyMode.AUTO_LOW for m in modes.values())
    if all_low and all_auto:
        return Route.AUTO, "every action is low risk and its capability is in auto_low"
    return Route.ASK, "a person decides"
