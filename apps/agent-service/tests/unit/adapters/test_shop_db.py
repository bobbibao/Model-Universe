"""ShopDb without a database: row mapping (whole VND), the read-only transaction, and clear errors."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta
from typing import Any

import psycopg
import pytest
from psycopg import errors

from shop_agent.adapters.shop_db import (
    CLEARANCE_SQL,
    MISSING_VIEWS_SQL,
    RETURNS_SQL,
    SOLD_SQL,
    STOCK_SQL,
    WRITE_PRIVILEGE_SQL,
    ShopDb,
    ShopReadUnavailable,
    to_return_records,
    to_stock_item,
)
from shop_agent.domain.detectors import default_detectors
from shop_agent.domain.kpi import DEAD_STOCK_VALUE, RECOVERED_VALUE, RETURN_RATE_PCT
from tests.support.factories import NOW


def _stock(sku: str, quantity: int = 40, cost: int = 500_000, days: int = 120) -> dict[str, Any]:
    return {
        "sku": sku, "name": f"P {sku}", "category": "Áo", "quantity": quantity, "unit_cost_vnd": cost,
        "unit_price_vnd": 1_000_000, "sales_channel": "web", "stocked_at": NOW - timedelta(days=days),
    }  # fmt: skip


def _return(sku: str, quantity: int, refund: int, condition: str = "open_box") -> dict[str, Any]:
    return {
        "order_id": 7, "sku": sku, "reason": "wrong_size", "condition": condition, "quantity": quantity,
        "refund_vnd": refund, "returned_at": NOW - timedelta(days=5),
    }  # fmt: skip


ROWS: dict[str, list[dict[str, Any]]] = {
    STOCK_SQL: [_stock("OLD1"), _stock("OLD2", quantity=10), _stock("FRESH", days=5), _stock("RET", 30, days=10)],
    SOLD_SQL: [{"sku": "FRESH", "units": 40}, {"sku": "RET", "units": 6}],
    RETURNS_SQL: [_return("RET", 2, 2_000_000), _return("RET", 2, 1_500_000, "new")],
    CLEARANCE_SQL: [{"revenue_vnd": 12_500_000}],
    WRITE_PRIVILEGE_SQL: [{"can_write": False}],
    MISSING_VIEWS_SQL: [{"missing": None}],
}


class FakeCursor:
    def __init__(self, conn: FakeConnection) -> None:
        self.conn, self._rows = conn, []  # type: ignore[var-annotated]

    async def __aenter__(self) -> FakeCursor:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def execute(self, sql: str, params: Sequence[Any] = ()) -> None:
        self.conn.executed.append((sql, tuple(params)))
        if self.conn.fail_with is not None and not sql.startswith("SET LOCAL"):
            raise self.conn.fail_with
        self._rows = self.conn.rows.get(sql, [])

    async def fetchall(self) -> list[dict[str, Any]]:
        return self._rows


class FakeConnection:
    def __init__(self, rows: dict[str, list[dict[str, Any]]], fail_with: Exception | None = None) -> None:
        self.rows, self.fail_with = rows, fail_with
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.read_only: bool | None = None
        self.isolation: psycopg.IsolationLevel | None = None

    async def __aenter__(self) -> FakeConnection:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def set_read_only(self, value: bool) -> None:
        self.read_only = value

    async def set_isolation_level(self, value: psycopg.IsolationLevel) -> None:
        self.isolation = value

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)


def _db(conn: FakeConnection) -> ShopDb:
    async def connect(_dsn: str) -> Any:
        return conn

    return ShopDb("postgresql://ci_reader@db/shop", connect=connect)


def test_rows_map_to_whole_vnd() -> None:
    item = to_stock_item(_stock("A", cost=268_000, days=95), NOW)
    assert (item.sku, item.quantity, item.days_in_stock, item.unit_cost_vnd) == ("A", 40, 95, 268_000)
    records = to_return_records(_return("R", 3, 1_500_000))
    assert len(records) == 3 and {r.refund_vnd for r in records} == {500_000}


async def test_snapshot_reads_in_one_read_only_repeatable_read_transaction() -> None:
    conn = FakeConnection(ROWS)
    snap = await _db(conn).snapshot(NOW)
    assert conn.read_only is True and conn.isolation is psycopg.IsolationLevel.REPEATABLE_READ
    assert conn.executed[0][0].startswith("SET LOCAL statement_timeout")
    assert [sql for sql, _ in conn.executed[1:]] == [STOCK_SQL, SOLD_SQL, RETURNS_SQL, CLEARANCE_SQL]
    assert conn.executed[3][1] == (NOW - timedelta(days=30),)
    assert (len(snap.stock), len(snap.returns), snap.recovered_vnd) == (4, 4, 12_500_000)


async def test_real_rows_drive_the_detectors_and_kpis() -> None:
    db = _db(FakeConnection(ROWS))
    snap = await db.snapshot(NOW)
    found = {o.kind: o for d in default_detectors() for o in d.detect(snap, NOW)}
    assert found["dead_stock"].skus == ("OLD1", "OLD2")
    assert found["high_returns"].skus == ("RET",)
    kpis = await db.kpis([DEAD_STOCK_VALUE, RETURN_RATE_PCT, RECOVERED_VALUE], NOW)
    assert kpis == {
        DEAD_STOCK_VALUE: 50 * 500_000,
        RETURN_RATE_PCT: round(4 / 46 * 100, 3),
        RECOVERED_VALUE: 12_500_000,
    }


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (errors.UndefinedTable('relation "analytics.stock_on_hand" does not exist'), "analytics views missing"),
        (errors.InsufficientPrivilege("permission denied for schema analytics"), "no permission to read"),
    ],
)
async def test_database_errors_become_clear(error: Exception, message: str) -> None:
    with pytest.raises(ShopReadUnavailable, match=message):
        await _db(FakeConnection(ROWS, fail_with=error)).snapshot(NOW)


async def test_unreachable_database() -> None:
    async def refuse(_dsn: str) -> Any:
        raise psycopg.OperationalError("connection refused\nIs the server running?")

    with pytest.raises(ShopReadUnavailable, match=r"shop database unreachable: connection refused$"):
        await ShopDb("postgresql://x", connect=refuse).snapshot(NOW)


async def test_a_writable_role_is_refused_in_production() -> None:
    rows = {**ROWS, WRITE_PRIVILEGE_SQL: [{"can_write": True}]}
    with pytest.raises(RuntimeError, match="read-only ci_reader role"):
        await _db(FakeConnection(rows)).check(strict=True)
    await _db(FakeConnection(rows)).check(strict=False)  # logged only


async def test_postponed_write_check_fails_closed() -> None:
    conn = FakeConnection({**ROWS, WRITE_PRIVILEGE_SQL: [{"can_write": True}]}, fail_with=errors.UndefinedTable("x"))
    db = _db(conn)
    await db.check(strict=True)  # not ready: the check moves to the first read
    conn.fail_with = None
    with pytest.raises(ShopReadUnavailable, match="reads are refused"):
        await db.snapshot(NOW)
    conn.rows[WRITE_PRIVILEGE_SQL] = [{"can_write": False}]
    assert (await db.snapshot(NOW)).stock
    conn.executed.clear()
    await db.snapshot(NOW)
    assert WRITE_PRIVILEGE_SQL not in [sql for sql, _ in conn.executed]
