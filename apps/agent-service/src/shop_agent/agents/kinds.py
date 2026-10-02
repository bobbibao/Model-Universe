"""What each opportunity kind brings to the generic `improvement` graph (docs/ARCHITECTURE.md section 13).

A kind names its playbook (runtime skills in `apps/agent-service/skills/`), the read and estimator tools its
investigation may use, the action types its options may contain, its planner (how options are offered, rebuilt by
code and tiered: v1 operations or growth levers), and how it is measured. Playbooks are read once, at import.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

from langchain_core.tools import BaseTool

from shop_agent.adapters.growth_files import BASE_PRIORS, GROWTH_DEFAULTS
from shop_agent.domain.actions import ActionSpec, ActionType
from shop_agent.domain.capabilities import RiskTier
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.growth.defaults import Priors
from shop_agent.domain.growth.policies import (
    LEGAL_MAX_COMBINED,
    LOW_AD_DAILY_VND,
    LOW_AD_DAYS,
    LOW_AD_TOTAL_VND,
    LOW_DISCOUNT_DAYS,
    LOW_DISCOUNT_PCT,
)
from shop_agent.domain.growth.snapshot import GrowthSnapshot
from shop_agent.domain.growth.strategies import GrowthFacts, growth_menu, growth_tier, plan_growth, strategy_title
from shop_agent.domain.measurement import MEASUREMENT_PLANS, MeasurementPlan
from shop_agent.domain.models import Opportunity
from shop_agent.domain.options import STRATEGIES, OptionPlan, menu, plan_option
from shop_agent.domain.policies.autonomy import AutonomySettings
from shop_agent.domain.policies.limits import Limits
from shop_agent.domain.policies.tiers import option_tier
from shop_agent.domain.shop import ShopSnapshot
from shop_agent.tools.brand import check_copy
from shop_agent.tools.estimators import (
    estimate_bundle,
    estimate_discount,
    estimate_donation,
    estimate_outlet,
    estimate_recycle,
    estimate_repackage,
)
from shop_agent.tools.growth_reads import (
    get_active_promotions,
    get_campaign_performance,
    get_competitor_campaigns,
    get_competitor_prices,
    get_goal_pacing,
    get_market_trends,
    get_policy_limits,
    get_sales_summary,
    get_sku_performance,
    get_upcoming_events,
    list_marketing_assets,
)
from shop_agent.tools.knowledge import search_cases, search_knowledge, search_products
from shop_agent.tools.metrics import find_dead_stock, find_high_return_skus, get_kpis, get_stock

SKILLS_DIR = Path(__file__).resolve().parents[3] / "skills"
Params = dict[str, Any]


def load_playbook(*names: str, skills_dir: Path = SKILLS_DIR) -> str:
    """The bodies of `skills/<name>/SKILL.md`, without their frontmatter, joined in order."""
    bodies = []
    for name in names:
        text = (skills_dir / name / "SKILL.md").read_text(encoding="utf-8")
        if text.startswith("---"):
            _, _, rest = text[3:].partition("\n---")
            text = rest
        bodies.append(text.strip())
    return "\n\n".join(bodies)


@dataclass(frozen=True)
class Facts:
    """The shop at one moment, as options are planned from it."""

    shop: ShopSnapshot
    growth: GrowthSnapshot
    thread_id: str
    now: datetime
    priors: Priors = BASE_PRIORS

    @property
    def growth_facts(self) -> GrowthFacts:
        return GrowthFacts(self.growth, self.thread_id, GROWTH_DEFAULTS, self.priors)


class Planner(Protocol):
    """How a family of kinds offers options and rebuilds a chosen one by code (validate)."""

    def title(self, strategy: str) -> str: ...

    def menu(self, opportunity: Opportunity, facts: Facts) -> list[OptionPlan[Any]]: ...

    def plan(
        self, option_id: str, strategy: str, params: Params | None, opportunity: Opportunity, facts: Facts
    ) -> OptionPlan[Any]: ...

    def tier(
        self, actions: Sequence[ActionSpec], plan: OptionPlan[Any], opportunity: Opportunity, facts: Facts
    ) -> RiskTier: ...

    def limits(self, facts: Facts, limits: Limits) -> dict[str, Any]: ...

    def autonomy(self, facts: Facts, default: AutonomySettings) -> AutonomySettings: ...


class OpsPlanner:
    """v1 operations (dead stock, high returns): `domain.options`, the agent's own autonomy settings."""

    def title(self, strategy: str) -> str:
        found = STRATEGIES.get(strategy)
        return found.title if found else strategy

    def menu(self, opportunity: Opportunity, facts: Facts) -> list[OptionPlan[Any]]:
        return menu(opportunity, facts.shop, facts.now)

    def plan(
        self, option_id: str, strategy: str, params: Params | None, opportunity: Opportunity, facts: Facts
    ) -> OptionPlan[Any]:
        return plan_option(strategy, params, opportunity, facts.shop, facts.now)

    def tier(
        self, actions: Sequence[ActionSpec], plan: OptionPlan[Any], opportunity: Opportunity, facts: Facts
    ) -> RiskTier:
        estimate = plan.estimate
        assert isinstance(estimate, Estimate)  # noqa: S101 - ops strategies return ops estimates
        return option_tier(actions, estimate, opportunity.severity)

    def limits(self, facts: Facts, limits: Limits) -> dict[str, Any]:
        return {
            "max_discount_pct": limits.max_discount_pct,
            "max_skus_per_option": limits.max_skus_per_option,
            "max_option_cost_vnd": limits.max_option_cost_vnd,
        }

    def autonomy(self, facts: Facts, default: AutonomySettings) -> AutonomySettings:
        return default


class GrowthPlanner:
    """Growth levers: `domain.growth.strategies`, the owner's settings from the web (brand gate included)."""

    def title(self, strategy: str) -> str:
        return strategy_title(strategy)

    def menu(self, opportunity: Opportunity, facts: Facts) -> list[OptionPlan[Any]]:
        return growth_menu(opportunity, facts.growth_facts)

    def plan(
        self, option_id: str, strategy: str, params: Params | None, opportunity: Opportunity, facts: Facts
    ) -> OptionPlan[Any]:
        return plan_growth(option_id, strategy, params, opportunity, facts.growth_facts)

    def tier(
        self, actions: Sequence[ActionSpec], plan: OptionPlan[Any], opportunity: Opportunity, facts: Facts
    ) -> RiskTier:
        return growth_tier(actions, facts.growth)

    def limits(self, facts: Facts, limits: Limits) -> dict[str, Any]:
        settings = facts.growth.settings
        budget = facts.growth.budget[-1] if facts.growth.budget else None
        return {
            "max_discount_pct": min(limits.max_discount_pct, LEGAL_MAX_COMBINED * 100),
            "margin_floor_pct": settings.goal.margin_floor_pct,
            "ad_per_day_vnd": settings.caps.per_day_vnd,
            "ad_per_campaign_vnd": settings.caps.per_campaign_vnd,
            "ad_budget_left_vnd": budget.remaining_vnd if budget else 0,
            "low_risk": {
                "discount_pct": LOW_DISCOUNT_PCT,
                "discount_days": LOW_DISCOUNT_DAYS,
                "ad_daily_vnd": LOW_AD_DAILY_VND,
                "ad_total_vnd": LOW_AD_TOTAL_VND,
                "ad_days": LOW_AD_DAYS,
            },
        }

    def autonomy(self, facts: Facts, default: AutonomySettings) -> AutonomySettings:
        return facts.growth.settings.autonomy_settings()


OPS = OpsPlanner()
GROWTH = GrowthPlanner()


@dataclass(frozen=True)
class KindSpec:
    kind: str
    playbook: str
    read_tools: tuple[BaseTool, ...]
    action_types: frozenset[ActionType]
    measurement: MeasurementPlan
    planner: Planner = OPS
    estimator_tools: tuple[BaseTool, ...] = field(default=())

    @property
    def tools(self) -> list[BaseTool]:
        return [*self.read_tools, *self.estimator_tools]

    @property
    def growth(self) -> bool:
        return isinstance(self.planner, GrowthPlanner)


KNOWLEDGE = (search_knowledge, search_cases, search_products)
GROWTH_BASE = (
    get_sales_summary,
    get_goal_pacing,
    get_active_promotions,
    get_policy_limits,
    search_knowledge,
    search_cases,
    check_copy,
)
CAMPAIGN_ACTIONS: frozenset[ActionType] = frozenset(
    {"create_campaign", "apply_discount", "create_coupon", "create_post", "create_ad", "activate_ad"}
)
# Growth outcomes are measured by `domain.growth.measurement` (incrementality), `after_days` after the flight.
GROWTH_MEASUREMENT = MeasurementPlan((), GROWTH_DEFAULTS.measurement.after_days)


def _growth(
    kind: str, skills: tuple[str, ...], tools: tuple[BaseTool, ...], actions: frozenset[ActionType]
) -> KindSpec:
    return KindSpec(
        kind=kind,
        playbook=load_playbook("growth-planning", *skills),
        read_tools=(*GROWTH_BASE, *tools),
        action_types=actions,
        measurement=GROWTH_MEASUREMENT,
        planner=GROWTH,
    )


POST, ADS, PROMO, VOICE = "facebook-post", "ad-campaign", "promotion", "brand-voice"

KINDS: dict[str, KindSpec] = {
    spec.kind: spec
    for spec in (
        KindSpec(
            kind="dead_stock",
            playbook=load_playbook("dead-stock"),
            read_tools=(find_dead_stock, get_stock, get_kpis, *KNOWLEDGE),
            estimator_tools=(estimate_discount, estimate_bundle, estimate_outlet, estimate_donation, estimate_recycle),
            action_types=frozenset({"apply_discount", "create_task", "switch_channel", "adjust_inventory"}),
            measurement=MEASUREMENT_PLANS["dead_stock"],
        ),
        KindSpec(
            kind="high_returns",
            playbook=load_playbook("high-returns"),
            read_tools=(find_high_return_skus, get_stock, get_kpis, *KNOWLEDGE),
            estimator_tools=(estimate_repackage, estimate_outlet),
            action_types=frozenset({"adjust_inventory", "create_task", "switch_channel", "update_sop_checklist"}),
            measurement=MEASUREMENT_PLANS["high_returns"],
        ),
        _growth(
            "revenue_gap", (PROMO, POST, ADS, VOICE), (get_campaign_performance, get_sku_performance), CAMPAIGN_ACTIONS
        ),
        _growth("overstock", (PROMO, POST, ADS, VOICE), (get_sku_performance,), CAMPAIGN_ACTIONS),
        _growth("rising_demand", (POST, ADS, VOICE), (get_sku_performance, list_marketing_assets), CAMPAIGN_ACTIONS),
        _growth(
            "competitor_undercut",
            ("competitive-response", PROMO, POST, VOICE),
            (get_competitor_prices, get_sku_performance),
            CAMPAIGN_ACTIONS,
        ),
        _growth(
            "competitor_campaign",
            ("competitive-response", PROMO, POST, VOICE),
            (get_competitor_campaigns,),
            CAMPAIGN_ACTIONS,
        ),
        _growth("trend_spike", (ADS, POST, VOICE), (get_market_trends, get_sku_performance), CAMPAIGN_ACTIONS),
        _growth(
            "seasonal_event",
            ("seasonal-campaign", PROMO, POST, ADS, VOICE),
            (get_upcoming_events, get_sku_performance, list_marketing_assets),
            CAMPAIGN_ACTIONS,
        ),
        _growth("content_cadence", (POST, VOICE), (get_sku_performance, search_products), CAMPAIGN_ACTIONS),
        _growth("new_arrivals", (POST, ADS, VOICE), (get_sku_performance, list_marketing_assets), CAMPAIGN_ACTIONS),
        _growth("campaign_scaling", (ADS,), (get_campaign_performance,), frozenset({"set_ad_budget"})),
        _growth("bidding_upgrade", (ADS,), (get_campaign_performance,), frozenset({"set_ad_optimization"})),
        _growth(
            "weekly_plan",
            ("weekly-plan", POST, ADS, VOICE),
            (get_upcoming_events, get_campaign_performance, list_marketing_assets),
            CAMPAIGN_ACTIONS,
        ),
    )
}


def get_kind(kind: str) -> KindSpec:
    try:
        return KINDS[kind]
    except KeyError as exc:
        raise ValueError(f"no KindSpec for opportunity kind {kind!r}") from exc
