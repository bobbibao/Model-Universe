"""Deterministic estimates the planner can ask for. The same functions recompute every option in `validate`."""

from __future__ import annotations

from typing import Any

from langchain.tools import tool

from shop_agent.domain.models import Opportunity, Severity
from shop_agent.domain.money import format_vnd
from shop_agent.domain.options import STRATEGIES, OptionNotApplicable, OptionPlan, plan_option
from shop_agent.tools.deps import ShopToolRuntime, get_deps


def describe(plan: OptionPlan) -> str:
    e = plan.estimate
    lines = [
        f"strategy {plan.strategy} with {plan.params}:",
        f"- expected recovery {format_vnd(e.recovery_vnd)}, cost {format_vnd(e.cost_vnd)}, "
        f"net {format_vnd(e.net_vnd)}, waste avoided {format_vnd(e.waste_reduction_vnd)}, risk {e.risk}",
        *[f"- assumption: {a}" for a in e.assumptions],
        *[f"- action: {a.description}" for a in plan.actions],
    ]
    return "\n".join(lines)


async def _estimate(strategy: str, skus: list[str], params: dict[str, Any], runtime: ShopToolRuntime) -> str:
    deps = await get_deps(runtime)
    now = deps.clock()
    snapshot = await deps.reader.snapshot(now)
    kind = sorted(STRATEGIES[strategy].kinds)[0]
    opportunity = Opportunity(
        kind=kind,
        fingerprint="estimate",
        severity=Severity.LOW,
        title="",
        summary="",
        skus=tuple(skus),
        detected_at=now,
    )
    try:
        return describe(plan_option(strategy, params, opportunity, snapshot, now))
    except (OptionNotApplicable, ValueError) as exc:
        return f"Not applicable: {exc}"


@tool
async def estimate_discount(skus: list[str], percent: float, duration_days: int, runtime: ShopToolRuntime) -> str:
    """Estimate a time-limited percentage discount on these SKUs (recovery, cost, waste avoided)."""
    return await _estimate("discount", skus, {"percent": percent, "duration_days": duration_days}, runtime)


@tool
async def estimate_outlet(skus: list[str], runtime: ShopToolRuntime) -> str:
    """Estimate moving these SKUs to the outlet channel (only items 180+ days old or open-box qualify)."""
    return await _estimate("outlet", skus, {}, runtime)


@tool
async def estimate_bundle(
    skus: list[str], runtime: ShopToolRuntime, bundle_discount_pct: float = 25.0, anchor_sku: str | None = None
) -> str:
    """Estimate bundling these SKUs with a best seller (the anchor is chosen automatically when not given)."""
    params: dict[str, Any] = {"bundle_discount_pct": bundle_discount_pct}
    if anchor_sku:
        params["anchor_sku"] = anchor_sku
    return await _estimate("bundle", skus, params, runtime)


@tool
async def estimate_donation(skus: list[str], runtime: ShopToolRuntime) -> str:
    """Estimate donating these SKUs to a partner charity."""
    return await _estimate("donate", skus, {}, runtime)


@tool
async def estimate_recycle(skus: list[str], runtime: ShopToolRuntime) -> str:
    """Estimate recycling the damaged or expired units of these SKUs."""
    return await _estimate("recycle", skus, {}, runtime)


@tool
async def estimate_repackage(skus: list[str], runtime: ShopToolRuntime) -> str:
    """Estimate repackaging and restocking the returned units of these SKUs (new or open-box only)."""
    return await _estimate("repackage", skus, {}, runtime)


ESTIMATOR_TOOLS = [
    estimate_discount,
    estimate_outlet,
    estimate_bundle,
    estimate_donation,
    estimate_recycle,
    estimate_repackage,
]
