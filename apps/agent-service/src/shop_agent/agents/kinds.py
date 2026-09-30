"""What each opportunity kind brings to the generic `improvement` graph (docs/ARCHITECTURE.md section 13).

A kind names its playbook (a runtime skill in `apps/agent-service/skills/`), the read and estimator tools its
investigation may use, the action types its options may contain, how an option is planned and validated
(deterministic), how it is measured, and how risky an option is. Playbooks are read once, at import.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from langchain_core.tools import BaseTool

from shop_agent.domain.actions import ActionDraft, ActionSpec, ActionType
from shop_agent.domain.capabilities import RiskTier
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.measurement import MEASUREMENT_PLANS, MeasurementPlan
from shop_agent.domain.models import Opportunity, Severity
from shop_agent.domain.options import OptionPlan, plan_option
from shop_agent.domain.policies.tiers import option_tier
from shop_agent.domain.shop import ShopSnapshot
from shop_agent.tools.estimators import (
    estimate_bundle,
    estimate_discount,
    estimate_donation,
    estimate_outlet,
    estimate_recycle,
    estimate_repackage,
)
from shop_agent.tools.knowledge import search_cases, search_knowledge, search_products
from shop_agent.tools.metrics import find_dead_stock, find_high_return_skus, get_kpis, get_stock

SKILLS_DIR = Path(__file__).resolve().parents[3] / "skills"

PlanOption = Callable[[str, dict[str, Any] | None, Opportunity, ShopSnapshot, datetime], OptionPlan]
OptionTier = Callable[[Sequence[ActionDraft | ActionSpec], Estimate, Severity], RiskTier]


def load_playbook(name: str, skills_dir: Path = SKILLS_DIR) -> str:
    """The body of `skills/<name>/SKILL.md`, without its frontmatter."""
    text = (skills_dir / name / "SKILL.md").read_text(encoding="utf-8")
    if text.startswith("---"):
        _, _, rest = text[3:].partition("\n---")
        text = rest
    return text.strip()


@dataclass(frozen=True)
class KindSpec:
    kind: str
    playbook: str
    read_tools: tuple[BaseTool, ...]
    estimator_tools: tuple[BaseTool, ...]
    action_types: frozenset[ActionType]
    validate: PlanOption
    measurement: MeasurementPlan
    risk_tier: OptionTier

    @property
    def tools(self) -> list[BaseTool]:
        return [*self.read_tools, *self.estimator_tools]


KNOWLEDGE = (search_knowledge, search_cases, search_products)

KINDS: dict[str, KindSpec] = {
    spec.kind: spec
    for spec in (
        KindSpec(
            kind="dead_stock",
            playbook=load_playbook("dead-stock"),
            read_tools=(find_dead_stock, get_stock, get_kpis, *KNOWLEDGE),
            estimator_tools=(estimate_discount, estimate_bundle, estimate_outlet, estimate_donation, estimate_recycle),
            action_types=frozenset({"apply_discount", "create_task", "switch_channel", "adjust_inventory"}),
            validate=plan_option,
            measurement=MEASUREMENT_PLANS["dead_stock"],
            risk_tier=option_tier,
        ),
        KindSpec(
            kind="high_returns",
            playbook=load_playbook("high-returns"),
            read_tools=(find_high_return_skus, get_stock, get_kpis, *KNOWLEDGE),
            estimator_tools=(estimate_repackage, estimate_outlet),
            action_types=frozenset({"adjust_inventory", "create_task", "switch_channel", "update_sop_checklist"}),
            validate=plan_option,
            measurement=MEASUREMENT_PLANS["high_returns"],
            risk_tier=option_tier,
        ),
    )
}


def get_kind(kind: str) -> KindSpec:
    try:
        return KINDS[kind]
    except KeyError as exc:
        raise ValueError(f"no KindSpec for opportunity kind {kind!r}") from exc
