"""Hard limits on what an option may do. Checked in `validate` and again inside every write tool, so a person's
edit is limited exactly like the model's proposal (ADR-0011: limits are layered; the web keeps its own hard caps).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from shop_agent.domain.actions import ActionDraft, ActionSpec
from shop_agent.domain.estimators.common import Estimate
from shop_agent.domain.money import format_vnd


@dataclass(frozen=True)
class Limits:
    max_discount_pct: float = 40.0
    max_skus_per_option: int = 200
    max_option_cost_vnd: int = 125_000_000  # v1: 5,000 internal units


class LimitExceeded(ValueError):
    """A write would break a limit. The message says which and is safe to show."""


def _skus(body: dict[str, Any]) -> set[str]:
    skus = {str(s) for s in body.get("skus") or []}
    if "sku" in body:
        skus.add(str(body["sku"]))
    return skus


def action_violations(action: ActionDraft | ActionSpec, limits: Limits) -> list[str]:
    problems: list[str] = []
    if action.type == "apply_discount":
        percent = float(action.body.get("percent", 0))
        if percent > limits.max_discount_pct:
            problems.append(f"discount {percent:g}% is above the limit of {limits.max_discount_pct:g}%")
    if len(_skus(action.body)) > limits.max_skus_per_option:
        problems.append(f"action touches more than {limits.max_skus_per_option} SKUs")
    return problems


def option_violations(actions: Sequence[ActionDraft | ActionSpec], estimate: Estimate, limits: Limits) -> list[str]:
    problems = [p for action in actions for p in action_violations(action, limits)]
    touched: set[str] = set()
    for action in actions:
        touched |= _skus(action.body)
    if len(touched) > limits.max_skus_per_option:
        problems.append(f"option touches {len(touched)} SKUs, above the limit of {limits.max_skus_per_option}")
    if estimate.cost_vnd > limits.max_option_cost_vnd:
        limit = format_vnd(limits.max_option_cost_vnd)
        problems.append(f"estimated cost {format_vnd(estimate.cost_vnd)} is above the limit {limit}")
    return problems


def check_action(action: ActionDraft | ActionSpec, limits: Limits) -> None:
    problems = action_violations(action, limits)
    if problems:
        raise LimitExceeded("; ".join(problems))
