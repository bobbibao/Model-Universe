from datetime import datetime, timezone

from ci_agent.domain.models.shop import ShopSnapshot, StockItem
from ci_agent.domain.services.measurement_evaluator import evaluate
from ci_agent.domain.models.plan import MeasurementPlan
from ci_agent.domain.strategies.base import StrategyContext
from ci_agent.domain.strategies.discount import DiscountStrategy
from tests.support.factories import make_signal

NOW = datetime(2026, 1, 5, tzinfo=timezone.utc)


def _snapshot() -> ShopSnapshot:
    items = (StockItem("A1", "Widget", "misc", 10, 5.0, 10.0, 120), StockItem("A2", "Gadget", "misc", 5, 8.0, 16.0, 130))
    return ShopSnapshot(NOW, items, units_sold_30d={"A1": 1, "A2": 1})


def test_discount_preview_is_deterministic():
    strategy = DiscountStrategy()
    ctx = StrategyContext(snapshot=_snapshot(), now=NOW)
    signal = make_signal(skus=("A1", "A2"))
    option1 = strategy.preview(signal, ctx)
    option2 = strategy.preview(signal, ctx)
    assert option1 == option2
    assert option1.est_recovery_value > 0


def test_measurement_evaluator_success_when_kpi_improves_enough():
    plan = MeasurementPlan(("dead_stock_value",), 14, min_improvement_pct=10.0)
    result = evaluate(plan, {"dead_stock_value": 1000.0}, {"dead_stock_value": 400.0}, NOW)
    assert result.verdict.value == "success"
    assert result.deltas[0].improved is True


def test_measurement_evaluator_negative_when_kpi_worsens():
    plan = MeasurementPlan(("dead_stock_value",), 14, min_improvement_pct=10.0)
    result = evaluate(plan, {"dead_stock_value": 1000.0}, {"dead_stock_value": 1300.0}, NOW)
    assert result.verdict.value == "negative"
