from shop_agent.domain.detectors import DeadStockDetector, HighReturnRateDetector, default_detectors
from shop_agent.domain.models import Severity
from tests.support.factories import NOW, item, returned, snapshot


def test_dead_stock_flags_old_slow_items_only() -> None:
    snap = snapshot(
        item("OLD1", days=120),
        item("OLD2", days=95, quantity=10),
        item("FRESH", days=5),
        item("EMPTY", quantity=0),
        sold={"OLD1": 3, "FRESH": 40},
    )
    [found] = DeadStockDetector().detect(snap, NOW)
    assert found.skus == ("OLD1", "OLD2")
    assert found.evidence["value_at_risk_vnd"] == 50 * 500_000
    assert found.severity is Severity.LOW
    assert "SOP" not in found.title and found.title.startswith("Hàng tồn lâu")


def test_dead_stock_severity_follows_value_at_cost() -> None:
    medium = snapshot(item("A", quantity=250, cost=500_000))  # 125,000,000
    high = snapshot(item("A", quantity=1000, cost=500_000))  # 500,000,000
    assert DeadStockDetector().detect(medium, NOW)[0].severity is Severity.MEDIUM
    assert DeadStockDetector().detect(high, NOW)[0].severity is Severity.HIGH


def test_same_situation_same_fingerprint() -> None:
    a = snapshot(item("B", days=100), item("A", days=100))
    b = snapshot(item("A", days=200), item("B", days=91))
    assert DeadStockDetector().detect(a, NOW)[0].fingerprint == DeadStockDetector().detect(b, NOW)[0].fingerprint


def test_high_returns_needs_rate_and_minimum_count() -> None:
    returns = (*(returned("RET", n=n) for n in range(4)), returned("OK", n=0), returned("FEW", n=0))
    snap = snapshot(item("RET", days=10), item("OK", days=10), sold={"RET": 6, "OK": 100, "FEW": 1}, returns=returns)
    [found] = HighReturnRateDetector().detect(snap, NOW)
    assert found.skus == ("RET",)
    assert found.severity is Severity.HIGH  # 4 / 6 = 66.7%
    assert found.evidence["returns"] == 4


def test_no_opportunity_on_a_healthy_shop() -> None:
    snap = snapshot(item("A", days=10), sold={"A": 30})
    assert [o for d in default_detectors() for o in d.detect(snap, NOW)] == []
