from datetime import datetime, timezone

from ci_agent.application.services.command_executor import CommandExecutor
from ci_agent.domain.models.plan import ActionPlan, MeasurementPlan, PlannedAction
from ci_agent.infrastructure.shop.fake_shop import FakeShop
from ci_agent.infrastructure.system.clock import ManualClock

MEASURE = MeasurementPlan(("dead_stock_value",), 14)


def _shop_and_clock():
    clock = ManualClock(datetime(2026, 1, 1, tzinfo=timezone.utc))
    return FakeShop.seed_demo(clock, n_stock=5, n_returns=0), clock


def test_all_steps_succeed():
    shop, clock = _shop_and_clock()
    executor = CommandExecutor(shop, clock)
    skus = [i.sku for i in shop.snapshot().stock][:2]
    plan = ActionPlan.create("discount", (PlannedAction("apply_discount", {"skus": skus, "percent": 20}),), MEASURE)
    outcome = executor.execute("imp-1", plan, attempt=1)
    assert outcome.ok is True
    assert shop.discounts[skus[0]] == 20


def test_retry_skips_already_succeeded_steps():
    shop, clock = _shop_and_clock()
    executor = CommandExecutor(shop, clock)
    skus = [i.sku for i in shop.snapshot().stock][:1]
    plan = ActionPlan.create("discount", (
        PlannedAction("apply_discount", {"skus": skus, "percent": 20}),
        PlannedAction("create_task", {"title": "t", "assignee_role": "staff", "description": "d"}),
    ), MEASURE)
    shop.fail_once_types.add("create_task")
    first = executor.execute("imp-1", plan, attempt=1)
    assert first.ok is False
    assert shop.apply_counts.get("apply_discount") == 1  # step 0 succeeded once

    second = executor.execute("imp-1", plan, attempt=1, prior=first.records)
    assert second.ok is True
    assert shop.apply_counts.get("apply_discount") == 1  # not re-applied on retry


def test_failure_compensates_earlier_steps():
    shop, clock = _shop_and_clock()
    executor = CommandExecutor(shop, clock)
    skus = [i.sku for i in shop.snapshot().stock][:1]
    plan = ActionPlan.create("discount", (
        PlannedAction("apply_discount", {"skus": skus, "percent": 20}),
        PlannedAction("switch_channel", {"skus": skus, "to_channel": "outlet"}),
    ), MEASURE)
    shop.fail_types.add("switch_channel")
    outcome = executor.execute("imp-1", plan, attempt=1)
    assert outcome.ok is False
    assert skus[0] not in shop.discounts  # compensated back out
