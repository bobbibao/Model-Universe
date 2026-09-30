"""The five places where agent-written text carries an amount (T-03c): exact historical text with the default
MoneyFormat, VND with a configured one, and no computed number depends on the format."""
from datetime import UTC, datetime

import pytest

from ci_agent.domain.detectors.base import default_detectors
from ci_agent.domain.detectors.dead_stock import DeadStockDetector
from ci_agent.domain.kpi import DEAD_STOCK_VALUE, RETURN_RATE_PCT
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.plan import ActionPlan, MeasurementPlan
from ci_agent.domain.models.shop import ReturnRecord, ShopSnapshot, StockItem
from ci_agent.domain.policies.guardrails import (
    MaxPlanCost,
    PlanWithinDirective,
    default_engine,
)
from ci_agent.domain.services.directive_factory import build_directive
from ci_agent.domain.services.measurement_evaluator import evaluate
from ci_agent.domain.strategies.base import StrategyContext
from ci_agent.domain.strategies.bundle import BundleStrategy
from ci_agent.domain.strategies.discount import DiscountStrategy
from ci_agent.domain.strategies.donate import DonateStrategy
from ci_agent.domain.strategies.repackage import RepackageStrategy
from tests.support.factories import make_directive, make_signal

NOW = datetime(2026, 9, 29, 9, tzinfo=UTC)
VND = MoneyFormat(25_000)

SNAPSHOT = ShopSnapshot(
    taken_at=NOW,
    stock=(StockItem("A", "a", "c", 10, 100.0, 180.0, 120), StockItem("B", "b", "c", 5, 100.0, 180.0, 200),
           StockItem("HOT", "hot", "c", 50, 40.0, 90.0, 10)),
    returns=tuple(ReturnRecord(f"O{n}", "A", "wrong_size", "new", NOW, 60.0) for n in range(3)),
    units_sold_30d={"HOT": 30},
)


# 1. dead-stock signal summary ------------------------------------------------------------------------------

def test_dead_stock_summary():
    assert DeadStockDetector().detect(SNAPSHOT, NOW)[0].summary == "2 SKUs are dead stock (1,500 at cost)"
    assert DeadStockDetector(money=VND).detect(SNAPSHOT, NOW)[0].summary == \
        "2 SKUs are dead stock (37.500.000 ₫ at cost)"


def test_default_detectors_pass_the_format_to_the_detectors_that_write_amounts():
    signals = {s.kind: s for d in default_detectors(VND) for s in d.detect(SNAPSHOT, NOW)}
    assert "37.500.000 ₫" in signals["dead_stock"].summary
    plain = DeadStockDetector().detect(SNAPSHOT, NOW)[0]
    vnd = signals["dead_stock"]
    # Only the text differs: what drives dedupe, routing and autonomy is unchanged.
    assert (vnd.metrics, vnd.fingerprint, vnd.severity, vnd.subject_skus) ==         (plain.metrics, plain.fingerprint, plain.severity, plain.subject_skus)


# 2. measurement summary ------------------------------------------------------------------------------------

PLAN = MeasurementPlan((DEAD_STOCK_VALUE, RETURN_RATE_PCT), 14, 10.0)


def test_measurement_summary():
    baseline, current = {DEAD_STOCK_VALUE: 30429.52, RETURN_RATE_PCT: 12.5}, {DEAD_STOCK_VALUE: 25107.0,
                                                                            RETURN_RATE_PCT: 10.0}
    assert evaluate(PLAN, baseline, current, NOW).summary == (
        "dead_stock_value: 30429.5 -> 25107 (+17.5% better); return_rate_pct: 12.5 -> 10 (+20.0% better)")
    assert evaluate(PLAN, baseline, current, NOW, VND).summary == (
        "dead_stock_value: 760.738.000 ₫ -> 627.675.000 ₫ (+17.5% better); "
        "return_rate_pct: 12.5 -> 10 (+20.0% better)")  # only the currency KPI is converted


def test_currency_kpis_are_never_written_in_scientific_notation():
    plan = MeasurementPlan((DEAD_STOCK_VALUE,), 14, 10.0)
    summary = evaluate(plan, {DEAD_STOCK_VALUE: 1234567.0}, {DEAD_STOCK_VALUE: 1000000.0}, NOW).summary
    assert "e+" not in summary
    assert summary == "dead_stock_value: 1234567 -> 1000000 (+19.0% better)"


def test_the_verdict_and_deltas_do_not_depend_on_the_format():
    baseline, current = {DEAD_STOCK_VALUE: 30429.52, RETURN_RATE_PCT: 12.5}, {DEAD_STOCK_VALUE: 25107.0,
                                                                            RETURN_RATE_PCT: 10.0}
    plain, vnd = evaluate(PLAN, baseline, current, NOW), evaluate(PLAN, baseline, current, NOW, VND)
    assert (plain.verdict, plain.deltas) == (vnd.verdict, vnd.deltas)


# 3. question option lines are in application/services/notification_factory.py: see tests/unit/application.

# 4. guardrail messages -------------------------------------------------------------------------------------

def _plan(cost: float) -> ActionPlan:
    return ActionPlan.create("discount", (), MeasurementPlan((DEAD_STOCK_VALUE,), 14), cost)


def test_guardrail_messages():
    directive = make_directive(limits={"budget_cap": 500.0})
    assert PlanWithinDirective().check(_plan(612.5), directive) == \
        "Estimated cost 612.50 exceeds the approved budget 500.00"
    assert PlanWithinDirective(VND).check(_plan(612.5), directive) == \
        "Estimated cost 15.312.500 ₫ exceeds the approved budget 12.500.000 ₫"
    assert MaxPlanCost(5000.0).check(_plan(6000.5), directive) == "Estimated cost 6000.50 above the global limit 5000.00"
    assert MaxPlanCost(5000.0, VND).check(_plan(6000.5), directive) == \
        "Estimated cost 150.012.500 ₫ above the global limit 125.000.000 ₫"


def test_default_engine_threads_the_format_without_changing_the_rules():
    directive = make_directive(limits={"budget_cap": 500.0})
    assert default_engine().violations(_plan(612.5), directive) == \
        ["Estimated cost 612.50 exceeds the approved budget 500.00"]
    assert default_engine(money=VND).violations(_plan(612.5), directive) == \
        ["Estimated cost 15.312.500 ₫ exceeds the approved budget 12.500.000 ₫"]
    assert default_engine(money=VND).violations(_plan(400.0), directive) == []  # same limits


# 5. strategy assumptions -----------------------------------------------------------------------------------

@pytest.mark.parametrize("strategy,kind,default_text,vnd_text", [
    (DonateStrategy(), "dead_stock", "0.50 logistics per unit", "12.500 ₫ logistics per unit"),
    (BundleStrategy(), "dead_stock", "0.50 packaging cost per unit", "12.500 ₫ packaging cost per unit"),
    (RepackageStrategy(), "high_returns", "2.00 repackaging labour per unit", "50.000 ₫ repackaging labour per unit"),
])
def test_strategy_assumptions(strategy, kind, default_text, vnd_text):
    signal = make_signal(kind=kind, skus=("A", "B"))
    plain = strategy.preview(signal, StrategyContext(SNAPSHOT, NOW))
    vnd = strategy.preview(signal, StrategyContext(SNAPSHOT, NOW, money=VND))
    assert default_text in plain.assumptions and vnd_text in vnd.assumptions
    # Only the text differs: every estimate is computed exactly as before.
    assert (plain.est_recovery_value, plain.est_cost, plain.est_waste_reduction, plain.params) == \
        (vnd.est_recovery_value, vnd.est_cost, vnd.est_waste_reduction, vnd.params)


@pytest.mark.parametrize("strategy,kind", [
    (DiscountStrategy(), "dead_stock"), (DonateStrategy(), "dead_stock"), (BundleStrategy(), "dead_stock"),
    (RepackageStrategy(), "high_returns"),
])
def test_plans_and_their_hash_do_not_depend_on_the_format(strategy, kind):
    signal = make_signal(kind=kind, skus=("A", "B"))
    plans = []
    for money in (MoneyFormat(), VND):
        ctx = StrategyContext(SNAPSHOT, NOW, money=money)
        option = strategy.preview(signal, ctx)
        directive = build_directive(strategy, option, {}, signal.subject_skus, "user:1", NOW)
        plans.append(strategy.plan(signal, directive, ctx))
    plain, vnd = plans
    assert (plain.plan_hash, plain.estimated_cost, plain.actions) == (vnd.plan_hash, vnd.estimated_cost, vnd.actions)


def test_strategy_context_accepts_no_format_like_every_other_entry_point():
    ctx = StrategyContext(SNAPSHOT, NOW, money=None)
    assert ctx.money == MoneyFormat()
    assert ctx == StrategyContext(SNAPSHOT, NOW, money=MoneyFormat()) == StrategyContext(SNAPSHOT, NOW)
    assert hash(ctx.money) == hash(StrategyContext(SNAPSHOT, NOW).money)
    option = DonateStrategy().preview(make_signal(kind="dead_stock", skus=("A", "B")), ctx)
    assert "0.50 logistics per unit" in option.assumptions


def test_only_the_dead_stock_detector_takes_the_format():
    kinds = {d.kind: d for d in default_detectors(VND)}
    assert kinds["dead_stock"].money == VND
    assert {d.kind for d in default_detectors()} == set(kinds)
    plain = next(d for d in default_detectors() if d.kind == "dead_stock")
    assert plain.detect(SNAPSHOT, NOW) == DeadStockDetector().detect(SNAPSHOT, NOW)  # no format -> historical text
