"""ShopReadPort over the web shop's read-only `analytics` views (docs/ROADMAP.md T-03b, ADR-0002).

The views are defined by apps/web-ecommerce (src/core/server/database/analytics/AnalyticsViews.ts) and read
through the `ci_reader` role (infra/sql/ci_reader.sql): never the shop's tables. This module is the
anti-corruption layer: rows become domain types here, and the domain never sees the web schema.

Money: the views are in VND; the domain works in an internal unit (1 unit = MONEY_UNIT_VND VND) so its
thresholds and per-unit constants keep their meaning. Every amount is divided here; the HTTP layer multiplies
back for display (interfaces/http/money.py).

KPIs use the same definitions as FakeShop (infrastructure/shop/kpi_calc.py), so Measure is comparable.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import datetime, timedelta
from typing import Any

import psycopg
from psycopg import errors
from psycopg.rows import dict_row

from ci_agent.application.ports.system import ClockPort
from ci_agent.domain.kpi import RECOVERED_VALUE
from ci_agent.domain.models.shop import ReturnRecord, ShopSnapshot, StockItem
from ci_agent.infrastructure.shop.kpi_calc import snapshot_kpis

logger = logging.getLogger(__name__)

# Returns are counted over the same window as analytics.units_sold_30d, so the return rate compares like with like.
RETURNS_WINDOW_DAYS = 30
STATEMENT_TIMEOUT_MS = 10_000
CONNECT_TIMEOUT_S = 5

STOCK_SQL = ("SELECT sku, name, category, quantity, unit_cost_vnd, unit_price_vnd, sales_channel, stocked_at "
             "FROM analytics.stock_on_hand")
SOLD_SQL = "SELECT sku, units FROM analytics.units_sold_30d"
RETURNS_SQL = ("SELECT order_id, sku, reason, condition, quantity, refund_vnd, returned_at "
               "FROM analytics.returns WHERE returned_at >= %s")
CLEARANCE_SQL = "SELECT COALESCE(SUM(revenue_vnd), 0) AS revenue_vnd FROM analytics.clearance_sales"
VIEWS = ("stock_on_hand", "units_sold_30d", "returns", "clearance_sales")

# Any write privilege on any shop table: the agent must never hold one (it writes only through the Agent API).
# (No '%' in these statements: psycopg reads it as a parameter placeholder.)
WRITE_PRIVILEGE_SQL = """
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND has_table_privilege(quote_ident(schemaname) || '.' || quote_ident(tablename),
                                'INSERT, UPDATE, DELETE, TRUNCATE')
    ) AS can_write"""
MISSING_VIEWS_SQL = ("SELECT array_agg(v) AS missing FROM unnest(%s::text[]) AS v "
                     "WHERE to_regclass('analytics.' || v) IS NULL")


def _reason(exc: psycopg.Error) -> str:
    return exc.diag.message_primary or str(exc) or type(exc).__name__


class ShopReadUnavailable(Exception):
    """The shop's analytics views cannot be read. The message says why and is safe to show to an operator."""


# ---------------------------------------------------------------------------------------------- pure mapping

def to_units(vnd: float | None, money_unit_vnd: float) -> float:
    return round(float(vnd or 0) / money_unit_vnd, 4)


def to_stock_item(row: dict[str, Any], now: datetime, money_unit_vnd: float) -> StockItem:
    stocked_at: datetime = row["stocked_at"]
    return StockItem(
        sku=str(row["sku"]), name=str(row["name"]), category=str(row["category"]),
        quantity=int(row["quantity"]),
        unit_cost=to_units(row["unit_cost_vnd"], money_unit_vnd),
        unit_price=to_units(row["unit_price_vnd"], money_unit_vnd),
        days_in_stock=max(0, (now - stocked_at).days),
        channel=str(row["sales_channel"]),
        condition="new",  # the shop has no per-unit condition for stock (T-03 decision)
        expiry_date=None,  # clothing has no expiry
    )


def to_return_records(row: dict[str, Any], money_unit_vnd: float) -> list[ReturnRecord]:
    """One record per returned unit: the high-returns detector counts records, repackaging costs per unit."""
    quantity = int(row["quantity"])
    per_unit_refund = to_units(row["refund_vnd"], money_unit_vnd) / quantity if quantity else 0.0
    return [ReturnRecord(order_id=str(row["order_id"]), sku=str(row["sku"]), reason=str(row["reason"]),
                         condition=str(row["condition"]), returned_at=row["returned_at"],
                         refund_amount=round(per_unit_refund, 4))
            for _ in range(quantity)]


def to_snapshot(now: datetime, money_unit_vnd: float, stock_rows: Sequence[dict[str, Any]],
                sold_rows: Sequence[dict[str, Any]], return_rows: Sequence[dict[str, Any]]) -> ShopSnapshot:
    return ShopSnapshot(
        taken_at=now,
        stock=tuple(to_stock_item(r, now, money_unit_vnd) for r in stock_rows),
        returns=tuple(record for r in return_rows for record in to_return_records(r, money_unit_vnd)),
        units_sold_30d={str(r["sku"]): int(r["units"]) for r in sold_rows},
        feedback=(),  # reviews are deferred to T-01
    )


# ---------------------------------------------------------------------------------------------- adapter

WRITE_ROLE_MESSAGE = ("SHOP_READ_DSN connects as a role that can write to the shop's tables; use the read-only "
                      "ci_reader role (infra/sql/ci_reader.sql)")


class SqlShopReadAdapter:
    def __init__(self, dsn: str, clock: ClockPort, money_unit_vnd: float,
                 connect: Callable[..., Any] = psycopg.connect) -> None:
        if money_unit_vnd <= 0:
            raise ValueError("money_unit_vnd must be positive")
        self._dsn, self._clock, self._unit, self._connect = dsn, clock, money_unit_vnd, connect
        # Set by check(strict=True) when the database could not be checked at startup: the write-privilege check then
        # runs with the first read, and reads are refused while the role can write (fail closed).
        self._verify_before_read = False

    def _read(self, queries: Sequence[tuple[str, Sequence[Any]]]) -> list[list[dict[str, Any]]]:
        """Run the queries in ONE read-only, repeatable-read transaction (a consistent snapshot)."""
        try:
            with self._connect(self._dsn, row_factory=dict_row, connect_timeout=CONNECT_TIMEOUT_S) as conn:
                conn.read_only = True
                conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
                with conn.cursor() as cur:
                    cur.execute(f"SET LOCAL statement_timeout = {int(STATEMENT_TIMEOUT_MS)}")
                    results = []
                    for sql, params in queries:
                        cur.execute(sql, params)
                        results.append(cur.fetchall())
                    return results
        except errors.UndefinedTable as exc:
            raise ShopReadUnavailable(
                "analytics views missing: the web app has not created them (check its startup log for "
                f"'Analytics views could not be created'): {_reason(exc)}") from exc
        except errors.InsufficientPrivilege as exc:
            raise ShopReadUnavailable(
                "no permission to read the analytics views: run infra/sql/ci_reader.sql for this database "
                f"({_reason(exc)})") from exc
        except psycopg.OperationalError as exc:
            raise ShopReadUnavailable(f"shop database unreachable: {str(exc).strip().splitlines()[0]}") from exc

    def _checked_read(self, queries: Sequence[tuple[str, Sequence[Any]]]) -> list[list[dict[str, Any]]]:
        # The flag is read and cleared without a lock (scheduler and HTTP threads): at worst one extra check runs.
        if not self._verify_before_read:
            return self._read(queries)
        write, *results = self._read([(WRITE_PRIVILEGE_SQL, ()), *queries])
        if write[0]["can_write"]:
            raise ShopReadUnavailable(f"{WRITE_ROLE_MESSAGE}; reads are refused until it does")
        self._verify_before_read = False
        return results

    def _snapshot_queries(self, now: datetime) -> list[tuple[str, Sequence[Any]]]:
        return [(STOCK_SQL, ()), (SOLD_SQL, ()), (RETURNS_SQL, (now - timedelta(days=RETURNS_WINDOW_DAYS),))]

    def snapshot(self) -> ShopSnapshot:
        now = self._clock.now()
        stock, sold, returns = self._checked_read(self._snapshot_queries(now))
        return to_snapshot(now, self._unit, stock, sold, returns)

    def kpis(self, names: Sequence[str]) -> dict[str, float]:
        now = self._clock.now()
        stock, sold, returns, clearance = self._checked_read(self._snapshot_queries(now) + [(CLEARANCE_SQL, ())])
        values = {**snapshot_kpis(to_snapshot(now, self._unit, stock, sold, returns)),
                  RECOVERED_VALUE: round(to_units(clearance[0]["revenue_vnd"], self._unit), 2)}
        return {n: values[n] for n in names if n in values}

    # ----------------------------------------------------------------------------------------- startup check
    def check(self, strict: bool) -> None:
        """Verify the connection is read-only and the views exist.

        A role that can write to shop tables is refused when `strict` (production) and logged otherwise. Missing
        views or an unreachable database are only logged: the web app may create them later, and every read then
        fails with a clear ShopReadUnavailable.
        """
        try:
            (write,), (missing,) = self._read([(WRITE_PRIVILEGE_SQL, ()), (MISSING_VIEWS_SQL, (list(VIEWS),))])
        except ShopReadUnavailable as exc:
            logger.warning("Shop reads are not available yet: %s", exc)
            self._verify_before_read = strict  # production: check again with the first read, fail closed
            return
        if write["can_write"]:
            if strict:
                raise RuntimeError(WRITE_ROLE_MESSAGE)
            logger.warning("%s. Allowed in development only.", WRITE_ROLE_MESSAGE)
        if missing["missing"]:
            logger.warning("analytics views missing: %s (the web app creates them at startup)",
                           ", ".join(missing["missing"]))
