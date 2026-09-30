"""The strategies an option can use: which kinds they apply to, their parameters, their estimate and their actions.

The planner (an LLM) chooses strategies and parameters; everything here is deterministic. `validate` calls
`plan_option` for each proposed option: the estimate is recomputed (the model's own figures are discarded) and the
actions are built from the parameters, so the approved actions are exactly what `act` sends.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from shop_agent.domain.actions import ActionDraft
from shop_agent.domain.estimators import bundle, discount, donate, outlet, recycle, repackage
from shop_agent.domain.estimators.common import NOTHING, Estimate, in_stock, unit_count
from shop_agent.domain.models import Opportunity
from shop_agent.domain.shop import ShopSnapshot

DO_NOTHING = "do_nothing"


class OptionNotApplicable(ValueError):
    """The strategy has nothing to act on for this opportunity (no eligible SKUs, no bundle anchor, ...)."""


@dataclass(frozen=True)
class OptionPlan:
    strategy: str
    params: dict[str, Any]
    estimate: Estimate
    actions: tuple[ActionDraft, ...]


Params = dict[str, Any]


@dataclass(frozen=True)
class Strategy:
    name: str
    title: str
    kinds: frozenset[str]
    defaults: Callable[[Opportunity, ShopSnapshot], Params]
    check_params: Callable[[Params], list[str]]
    plan: Callable[[Opportunity, ShopSnapshot, Params, datetime], OptionPlan]


def _no_params(_params: Params) -> list[str]:
    return []


def _number_between(params: Params, name: str, low: float, high: float) -> list[str]:
    value = params.get(name)
    if isinstance(value, bool) or not isinstance(value, int | float) or not low <= value <= high:
        return [f"{name} must be a number between {low:g} and {high:g}"]
    return []


def _int_between(params: Params, name: str, low: int, high: int) -> list[str]:
    value = params.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        return [f"{name} must be a whole number between {low} and {high}"]
    return []


def _task(title: str, role: str, description: str, due_in_days: int) -> ActionDraft:
    body = {"title": title, "assignee_role": role, "description": description, "due_in_days": due_in_days}
    return ActionDraft(type="create_task", body=body, description=title)


# ------------------------------------------------------------------------------------------------ discount


def _discount_defaults(opportunity: Opportunity, _snapshot: ShopSnapshot) -> Params:
    return {"percent": 30.0 if opportunity.kind == "near_expiry" else 20.0, "duration_days": 14}


def _discount_check(params: Params) -> list[str]:
    return _number_between(params, "percent", 1, 90) + _int_between(params, "duration_days", 1, 90)


def _discount_plan(opportunity: Opportunity, snapshot: ShopSnapshot, params: Params, now: datetime) -> OptionPlan:
    items = discount.eligible(snapshot.items(opportunity.skus), now)
    if not items:
        raise OptionNotApplicable("no SKU is eligible for a discount")
    percent, days = float(params["percent"]), int(params["duration_days"])
    skus = [i.sku for i in items]
    actions = (
        ActionDraft(
            type="apply_discount",
            body={"skus": skus, "percent": percent, "duration_days": days},
            description=f"Giảm {percent:g}% cho {len(skus)} mã trong {days} ngày",
        ),
        _task(
            "Ưu tiên hiển thị các mã đang giảm giá",
            "merchandiser",
            f"Đưa {len(skus)} mã đang giảm giá lên trang chủ",
            2,
        ),
    )
    return OptionPlan(
        "discount", {"percent": percent, "duration_days": days}, discount.estimate(items, percent), actions
    )


# ------------------------------------------------------------------------------------------------ outlet


def _outlet_plan(opportunity: Opportunity, snapshot: ShopSnapshot, params: Params, _now: datetime) -> OptionPlan:
    items = outlet.eligible(snapshot.items(opportunity.skus))
    if not items:
        raise OptionNotApplicable("no SKU is eligible for the outlet channel")
    skus = [i.sku for i in items]
    action = ActionDraft(
        type="switch_channel",
        body={"skus": skus, "to_channel": "outlet"},
        description=f"Chuyển {len(skus)} mã sang kênh outlet",
    )
    return OptionPlan("outlet", {"to_channel": "outlet"}, outlet.estimate(items), (action,))


# ------------------------------------------------------------------------------------------------ bundle


def _bundle_defaults(opportunity: Opportunity, snapshot: ShopSnapshot) -> Params:
    return {"anchor_sku": bundle.anchor_sku(snapshot, opportunity.skus), "bundle_discount_pct": 25.0}


def _bundle_check(params: Params) -> list[str]:
    problems = _number_between(params, "bundle_discount_pct", 1, 60)
    if not isinstance(params.get("anchor_sku"), str) or not params["anchor_sku"]:
        problems.append("anchor_sku must name a best-selling SKU")
    return problems


def _bundle_plan(opportunity: Opportunity, snapshot: ShopSnapshot, params: Params, _now: datetime) -> OptionPlan:
    items = bundle.eligible(snapshot.items(opportunity.skus))
    anchor = params.get("anchor_sku") or bundle.anchor_sku(snapshot, opportunity.skus)
    if not items or not anchor:
        raise OptionNotApplicable("no eligible SKU or no best seller to bundle with")
    if anchor in opportunity.skus or not snapshot.items([anchor]):
        raise OptionNotApplicable(f"anchor {anchor} must be an in-stock SKU outside the opportunity")
    pct = float(params["bundle_discount_pct"])
    skus = [i.sku for i in items]
    actions = (
        _task(f"Tạo combo với {anchor}", "merchandiser", f"Ghép {len(skus)} mã bán chậm với {anchor}", 3),
        ActionDraft(
            type="apply_discount",
            body={"skus": skus, "percent": pct, "duration_days": 21},
            description=f"Giảm {pct:g}% cho combo",
        ),
    )
    params_out = {"anchor_sku": anchor, "bundle_discount_pct": pct}
    return OptionPlan("bundle", params_out, bundle.estimate(items, pct), actions)


# ------------------------------------------------------------------------------------------------ donate, recycle


def _donate_plan(opportunity: Opportunity, snapshot: ShopSnapshot, _params: Params, _now: datetime) -> OptionPlan:
    items = donate.eligible(snapshot.items(opportunity.skus))
    if not items:
        raise OptionNotApplicable("no SKU is eligible for donation")
    actions = [_task("Sắp xếp nhận hàng quyên góp", "logistics", f"Quyên góp {unit_count(items)} sản phẩm", 7)]
    actions += [
        ActionDraft(
            type="adjust_inventory",
            body={"sku": i.sku, "new_status": "donation_pending", "reason": "approved donation"},
            description=f"Giữ {i.sku} để quyên góp",
        )
        for i in items
    ]
    return OptionPlan("donate", {}, donate.estimate(items), tuple(actions))


def _recycle_plan(opportunity: Opportunity, snapshot: ShopSnapshot, _params: Params, now: datetime) -> OptionPlan:
    items = recycle.eligible(snapshot.items(opportunity.skus), now)
    if not items:
        raise OptionNotApplicable("no damaged or expired SKU to recycle")
    actions = [_task("Tái chế hàng hỏng hoặc hết hạn", "warehouse", f"Tái chế {unit_count(items)} sản phẩm", 7)]
    actions += [
        ActionDraft(
            type="adjust_inventory",
            body={"sku": i.sku, "new_status": "recycle", "reason": "damaged or expired"},
            description=f"Cách ly {i.sku}",
        )
        for i in items
    ]
    return OptionPlan("recycle", {}, recycle.estimate(items), tuple(actions))


# ------------------------------------------------------------------------------------------------ repackage


def _repackage_plan(opportunity: Opportunity, snapshot: ShopSnapshot, _params: Params, _now: datetime) -> OptionPlan:
    returns = repackage.eligible(snapshot.returns, opportunity.skus)
    if not returns:
        raise OptionNotApplicable("no returned unit can be repackaged")
    skus = sorted({r.sku for r in returns})
    actions = [
        _task(
            "Đóng gói lại hàng đổi trả",
            "warehouse",
            f"Đóng gói lại hàng đổi trả của {len(skus)} mã (SOP-002)",
            3,
        )
    ]
    actions += [
        ActionDraft(
            type="adjust_inventory",
            body={"sku": s, "new_status": "restock", "reason": "repackaged return"},
            description=f"Nhập lại kho {s}",
        )
        for s in skus
    ]
    return OptionPlan("repackage", {"units": len(returns)}, repackage.estimate(returns), tuple(actions))


# ------------------------------------------------------------------------------------------------ do nothing


def _nothing_plan(_opportunity: Opportunity, _snapshot: ShopSnapshot, _params: Params, _now: datetime) -> OptionPlan:
    return OptionPlan(DO_NOTHING, {}, NOTHING, ())


STRATEGIES: dict[str, Strategy] = {
    s.name: s
    for s in (
        Strategy(
            "discount",
            "Giảm giá có thời hạn",
            frozenset({"dead_stock", "near_expiry"}),
            _discount_defaults,
            _discount_check,
            _discount_plan,
        ),
        Strategy(
            "outlet",
            "Chuyển sang kênh outlet",
            frozenset({"dead_stock", "high_returns"}),
            lambda _o, _s: {"to_channel": "outlet"},
            _no_params,
            _outlet_plan,
        ),
        Strategy(
            "bundle",
            "Bán combo với sản phẩm bán chạy",
            frozenset({"dead_stock"}),
            _bundle_defaults,
            _bundle_check,
            _bundle_plan,
        ),
        Strategy(
            "donate",
            "Quyên góp cho đối tác từ thiện",
            frozenset({"dead_stock", "near_expiry"}),
            lambda _o, _s: {},
            _no_params,
            _donate_plan,
        ),
        Strategy(
            "recycle",
            "Tái chế hoặc tiêu hủy",
            frozenset({"dead_stock", "near_expiry"}),
            lambda _o, _s: {},
            _no_params,
            _recycle_plan,
        ),
        Strategy(
            "repackage",
            "Đóng gói lại và nhập kho hàng đổi trả",
            frozenset({"high_returns"}),
            lambda _o, _s: {},
            _no_params,
            _repackage_plan,
        ),
        Strategy(DO_NOTHING, "Không làm gì", frozenset(), lambda _o, _s: {}, _no_params, _nothing_plan),
    )
}


def strategies_for(kind: str) -> list[Strategy]:
    return [s for s in STRATEGIES.values() if kind in s.kinds or s.name == DO_NOTHING]


def plan_option(
    strategy_name: str, params: Params | None, opportunity: Opportunity, snapshot: ShopSnapshot, now: datetime
) -> OptionPlan:
    """Recompute an option from its strategy and parameters. Raises OptionNotApplicable or ValueError."""
    strategy = STRATEGIES.get(strategy_name)
    if strategy is None:
        raise ValueError(f"unknown strategy {strategy_name!r}")
    if strategy.name != DO_NOTHING and opportunity.kind not in strategy.kinds:
        raise ValueError(f"strategy {strategy_name!r} does not apply to {opportunity.kind!r}")
    merged = {**strategy.defaults(opportunity, snapshot), **(params or {})}
    problems = strategy.check_params(merged)
    if problems:
        raise ValueError("; ".join(problems))
    return strategy.plan(opportunity, snapshot, merged, now)


def menu(opportunity: Opportunity, snapshot: ShopSnapshot, now: datetime) -> list[OptionPlan]:
    """Every applicable strategy with its default parameters: what the planner chooses from."""
    plans = []
    for strategy in strategies_for(opportunity.kind):
        try:
            plans.append(plan_option(strategy.name, None, opportunity, snapshot, now))
        except (OptionNotApplicable, ValueError):
            continue
    return plans


def eligible_units(opportunity: Opportunity, snapshot: ShopSnapshot) -> int:
    return unit_count(in_stock(snapshot.items(opportunity.skus)))
