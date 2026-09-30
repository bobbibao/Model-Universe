import pytest

from shop_agent.domain.options import DO_NOTHING, STRATEGIES, OptionNotApplicable, menu, plan_option, strategies_for
from tests.support.factories import NOW, item, opportunity, returned, snapshot

SHOP = snapshot(
    item("A1", days=200),
    item("A2", days=120, condition="open_box"),
    item("BEST", days=10, quantity=60),
    sold={"BEST": 90},
    returns=(returned("A1", n=1), returned("A1", n=2, condition="damaged")),
)


def test_every_kind_offers_do_nothing() -> None:
    for kind in ("dead_stock", "high_returns"):
        assert DO_NOTHING in [s.name for s in strategies_for(kind)]


def test_discount_plan_builds_complete_bodies_and_recomputes_the_estimate() -> None:
    plan = plan_option("discount", {"percent": 25, "duration_days": 10}, opportunity(), SHOP, NOW)
    assert plan.params == {"percent": 25.0, "duration_days": 10}
    first, task = plan.actions
    assert first.type == "apply_discount" and first.body == {"skus": ["A1", "A2"], "percent": 25.0, "duration_days": 10}
    assert task.type == "create_task" and task.body["assignee_role"] == "merchandiser"
    assert plan.estimate.recovery_vnd > 0


def test_defaults_fill_missing_params() -> None:
    assert plan_option("discount", None, opportunity(), SHOP, NOW).params == {"percent": 20.0, "duration_days": 14}


@pytest.mark.parametrize(
    ("strategy", "params", "message"),
    [
        ("discount", {"percent": 95}, "percent must be"),
        ("discount", {"duration_days": 0}, "duration_days must be"),
        ("discount", {"percent": True}, "percent must be"),
        ("repackage", {}, "does not apply"),
        ("teleport", {}, "unknown strategy"),
    ],
)
def test_bad_params_are_refused(strategy: str, params: dict[str, object], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        plan_option(strategy, params, opportunity(), SHOP, NOW)


def test_bundle_picks_a_best_seller_outside_the_opportunity() -> None:
    plan = plan_option("bundle", None, opportunity(), SHOP, NOW)
    assert plan.params["anchor_sku"] == "BEST"
    with pytest.raises(OptionNotApplicable):
        plan_option("bundle", {"anchor_sku": "A1"}, opportunity(), SHOP, NOW)


def test_repackage_restocks_only_resellable_returns() -> None:
    plan = plan_option("repackage", None, opportunity("high_returns", ("A1",)), SHOP, NOW)
    assert plan.params == {"units": 1}
    assert [a.body for a in plan.actions if a.type == "adjust_inventory"] == [
        {"sku": "A1", "new_status": "restock", "reason": "repackaged return"}
    ]


def test_menu_lists_only_applicable_strategies() -> None:
    names = [p.strategy for p in menu(opportunity(), SHOP, NOW)]
    assert names[-1] == DO_NOTHING
    assert "recycle" not in names  # nothing damaged or expired
    assert {"discount", "outlet", "bundle", "donate"} <= set(names)
    assert set(names) <= set(STRATEGIES)
