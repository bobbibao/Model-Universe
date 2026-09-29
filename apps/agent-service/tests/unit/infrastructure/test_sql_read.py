"""SqlShopReadAdapter without a database: row mapping, money conversion, the read-only transaction, KPI parity
with FakeShop, and clear errors (e.g. "analytics views missing") instead of raw driver errors."""
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from psycopg import errors

from ci_agent.domain.detectors.base import default_detectors
from ci_agent.domain.kpi import (
    AVG_DAYS_IN_STOCK,
    DEAD_STOCK_VALUE,
    RECOVERED_VALUE,
    RETURN_RATE_PCT,
)
from ci_agent.domain.models.shop import ShopSnapshot, StockItem
from ci_agent.infrastructure.shop.kpi_calc import snapshot_kpis
from ci_agent.infrastructure.shop.sql_read import (
    CLEARANCE_SQL,
    MISSING_VIEWS_SQL,
    RETURNS_SQL,
    SOLD_SQL,
    STOCK_SQL,
    WRITE_PRIVILEGE_SQL,
    ShopReadUnavailable,
    SqlShopReadAdapter,
    to_return_records,
    to_stock_item,
)
from ci_agent.infrastructure.system.clock import ManualClock

NOW = datetime(2026, 9, 29, 9, tzinfo=UTC)
UNIT = 25_000.0


def _stock_row(sku, quantity=40, cost=500_000, price=1_000_000, days=120, channel="web"):
    return {"sku": sku, "name": f"Product {sku}", "category": "Áo", "quantity": quantity, "unit_cost_vnd": cost,
            "unit_price_vnd": price, "sales_channel": channel, "stocked_at": NOW - timedelta(days=days)}


def _return_row(sku, quantity, refund, days_ago=5, condition="open_box", reason="wrong_size"):
    return {"order_id": 7, "sku": sku, "reason": reason, "condition": condition, "quantity": quantity,
            "refund_vnd": refund, "returned_at": NOW - timedelta(days=days_ago)}


ROWS = {
    STOCK_SQL: [_stock_row("OLD1"), _stock_row("OLD2", quantity=10), _stock_row("FRESH", days=5),
                _stock_row("RET", quantity=30, days=10)],
    SOLD_SQL: [{"sku": "FRESH", "units": 40}, {"sku": "RET", "units": 6}],
    RETURNS_SQL: [_return_row("RET", 2, 2_000_000), _return_row("RET", 2, 1_500_000, condition="new")],
    CLEARANCE_SQL: [{"revenue_vnd": 12_500_000}],
}


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.conn.executed.append((sql, params))
        if self.conn.fail_with is not None and sql not in self.conn.allowed:
            raise self.conn.fail_with
        self._rows = self.conn.rows.get(sql, [])

    def fetchall(self):
        return self._rows


class FakeConnection:
    def __init__(self, rows, fail_with=None):
        self.rows, self.fail_with, self.allowed = rows, fail_with, set()
        self.executed, self.read_only, self.isolation_level = [], None, None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return FakeCursor(self)


def _adapter(conn):
    return SqlShopReadAdapter("postgresql://ci_reader@db/shop", ManualClock(NOW), UNIT, connect=lambda *a, **k: conn)


def test_stock_rows_become_domain_items_in_the_internal_money_unit():
    item = to_stock_item(_stock_row("A", cost=268_000, price=447_000, days=95, channel="outlet"), NOW, UNIT)
    assert (item.sku, item.quantity, item.days_in_stock, item.channel) == ("A", 40, 95, "outlet")
    assert (item.unit_cost, item.unit_price) == (10.72, 17.88)  # VND / 25,000
    assert (item.condition, item.expiry_date) == ("new", None)


def test_each_returned_unit_is_one_record_with_its_share_of_the_refund():
    records = to_return_records(_return_row("R", 3, 1_500_000), UNIT)
    assert len(records) == 3
    assert {r.refund_amount for r in records} == {20.0}  # 1,500,000 / 3 / 25,000
    assert {(r.sku, r.reason, r.condition) for r in records} == {("R", "wrong_size", "open_box")}


def test_snapshot_reads_everything_in_one_read_only_repeatable_read_transaction():
    conn = FakeConnection(ROWS)
    snapshot = _adapter(conn).snapshot()
    assert conn.read_only is True and conn.isolation_level is psycopg.IsolationLevel.REPEATABLE_READ
    assert conn.executed[0][0].startswith("SET LOCAL statement_timeout")
    assert [sql for sql, _ in conn.executed[1:]] == [STOCK_SQL, SOLD_SQL, RETURNS_SQL]
    assert conn.executed[3][1] == (NOW - timedelta(days=30),)  # returns window = units_sold_30d window
    assert len(snapshot.stock) == 4 and len(snapshot.returns) == 4 and snapshot.feedback == ()


def test_real_rows_drive_the_live_detectors():
    snapshot = _adapter(FakeConnection(ROWS)).snapshot()
    signals = {s.kind: s for d in default_detectors() for s in d.detect(snapshot, NOW)}
    assert signals["dead_stock"].subject_skus == ("OLD1", "OLD2")
    assert signals["high_returns"].subject_skus == ("RET",)  # 4 returned of 6 sold
    assert "near_expiry" not in signals  # clothing: no expiry dates


def test_kpis_match_the_shared_definitions_and_convert_recovered_value():
    adapter = _adapter(FakeConnection(ROWS))
    kpis = adapter.kpis([DEAD_STOCK_VALUE, RETURN_RATE_PCT, RECOVERED_VALUE, AVG_DAYS_IN_STOCK])
    assert kpis[DEAD_STOCK_VALUE] == snapshot_kpis(adapter.snapshot())[DEAD_STOCK_VALUE] == 1000.0
    assert kpis[RETURN_RATE_PCT] == round(4 / 46 * 100, 3)
    assert kpis[RECOVERED_VALUE] == 500.0  # 12,500,000 VND


def test_snapshot_kpis_definitions():
    snapshot = ShopSnapshot(NOW, (StockItem("A", "a", "c", 10, 5.0, 9.0, 100), StockItem("B", "b", "c", 0, 5.0, 9.0, 300)),
                            units_sold_30d={"A": 3})
    assert snapshot_kpis(snapshot) == {DEAD_STOCK_VALUE: 50.0, RETURN_RATE_PCT: 0.0, AVG_DAYS_IN_STOCK: 100.0}


@pytest.mark.parametrize("error,message", [
    (errors.UndefinedTable('relation "analytics.stock_on_hand" does not exist'), "analytics views missing"),
    (errors.InsufficientPrivilege("permission denied for schema analytics"), "no permission to read"),
])
def test_database_errors_become_clear_shop_read_errors(error, message):
    with pytest.raises(ShopReadUnavailable, match=message):
        _adapter(FakeConnection(ROWS, fail_with=error)).snapshot()


def test_unreachable_database_is_reported_clearly():
    def refuse(*_args, **_kwargs):
        raise psycopg.OperationalError("connection refused\nIs the server running?")
    adapter = SqlShopReadAdapter("postgresql://ci_reader@db/shop", ManualClock(NOW), UNIT, connect=refuse)
    with pytest.raises(ShopReadUnavailable, match="shop database unreachable: connection refused$"):
        adapter.kpis([DEAD_STOCK_VALUE])


def test_a_role_that_can_write_is_refused_in_production_and_logged_in_development(caplog):
    rows = {WRITE_PRIVILEGE_SQL: [{"can_write": True}], MISSING_VIEWS_SQL: [{"missing": None}]}
    with pytest.raises(RuntimeError, match="read-only ci_reader role"):
        _adapter(FakeConnection(rows)).check(strict=True)
    _adapter(FakeConnection(rows)).check(strict=False)
    assert "can write to the shop's tables" in caplog.text


def test_startup_check_logs_missing_views(caplog):
    rows = {WRITE_PRIVILEGE_SQL: [{"can_write": False}], MISSING_VIEWS_SQL: [{"missing": ["returns"]}]}
    _adapter(FakeConnection(rows)).check(strict=True)
    assert "analytics views missing: returns" in caplog.text


def test_startup_check_only_logs_when_the_database_is_not_ready(caplog):
    _adapter(FakeConnection(ROWS, fail_with=errors.UndefinedTable("no views"))).check(strict=True)
    assert "Shop reads are not available yet" in caplog.text
