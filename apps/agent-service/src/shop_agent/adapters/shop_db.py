"""ShopReader over the web shop's read-only `analytics` views (ADR-0002), as the `ci_reader` role.

The views are defined by apps/web-ecommerce (src/core/server/database/analytics/AnalyticsViews.ts); this module maps
their rows to domain types (money stays whole VND). Every read runs in one read-only, repeatable-read transaction with
a statement timeout, and a role that can write to the shop is refused in production.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timedelta
from typing import Any

import psycopg
from psycopg import errors
from psycopg.rows import DictRow, dict_row

from shop_agent.domain.kpi_calc import snapshot_kpis
from shop_agent.domain.shop import ReturnRecord, ShopSnapshot, StockItem
from shop_agent.logging import get_logger

logger = get_logger(__name__)

RETURNS_WINDOW_DAYS = 30  # same window as analytics.units_sold_30d
STATEMENT_TIMEOUT_MS = 10_000
CONNECT_TIMEOUT_S = 5

STOCK_SQL = (
    "SELECT sku, name, category, quantity, unit_cost_vnd, unit_price_vnd, sales_channel, stocked_at "
    "FROM analytics.stock_on_hand"
)
SOLD_SQL = "SELECT sku, units FROM analytics.units_sold_30d"
RETURNS_SQL = (
    "SELECT order_id, sku, reason, condition, quantity, refund_vnd, returned_at "
    "FROM analytics.returns WHERE returned_at >= %s"
)
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
MISSING_VIEWS_SQL = (
    "SELECT array_agg(v) AS missing FROM unnest(%s::text[]) AS v WHERE to_regclass('analytics.' || v) IS NULL"
)
WRITE_ROLE_MESSAGE = (
    "SHOP_READ_DSN connects as a role that can write to the shop's tables; use the read-only ci_reader role "
    "(infra/sql/ci_reader.sql)"
)

Connect = Callable[..., Awaitable[psycopg.AsyncConnection[DictRow]]]


class ShopReadUnavailable(Exception):
    """The analytics views cannot be read. The message says why and is safe to show to an operator."""


def _reason(exc: psycopg.Error) -> str:
    return exc.diag.message_primary or str(exc) or type(exc).__name__


# ------------------------------------------------------------------------------------------------ pure mapping


def to_stock_item(row: dict[str, Any], now: datetime) -> StockItem:
    stocked_at: datetime = row["stocked_at"]
    return StockItem(
        sku=str(row["sku"]),
        name=str(row["name"]),
        category=str(row["category"]),
        quantity=int(row["quantity"]),
        unit_cost_vnd=int(row["unit_cost_vnd"] or 0),
        unit_price_vnd=int(row["unit_price_vnd"] or 0),
        days_in_stock=max(0, (now - stocked_at).days),
        channel=str(row["sales_channel"]),
        condition="new",  # the shop records no per-unit condition for stock
        expiry_date=None,  # clothing has no expiry
    )


def to_return_records(row: dict[str, Any]) -> list[ReturnRecord]:
    """One record per returned unit: the high-returns detector counts records, repackaging costs per unit."""
    quantity = int(row["quantity"])
    per_unit = round(int(row["refund_vnd"] or 0) / quantity) if quantity else 0
    return [
        ReturnRecord(
            order_id=str(row["order_id"]),
            sku=str(row["sku"]),
            reason=str(row["reason"]),
            condition=str(row["condition"]),
            returned_at=row["returned_at"],
            refund_vnd=per_unit,
        )
        for _ in range(quantity)
    ]


def to_snapshot(
    now: datetime,
    stock_rows: Sequence[dict[str, Any]],
    sold_rows: Sequence[dict[str, Any]],
    return_rows: Sequence[dict[str, Any]],
    recovered_vnd: int = 0,
) -> ShopSnapshot:
    return ShopSnapshot(
        taken_at=now,
        stock=tuple(to_stock_item(r, now) for r in stock_rows),
        returns=tuple(record for r in return_rows for record in to_return_records(r)),
        units_sold_30d={str(r["sku"]): int(r["units"]) for r in sold_rows},
        recovered_vnd=recovered_vnd,
    )


# ------------------------------------------------------------------------------------------------ adapter


async def _connect(dsn: str) -> psycopg.AsyncConnection[DictRow]:
    return await psycopg.AsyncConnection.connect(dsn, row_factory=dict_row, connect_timeout=CONNECT_TIMEOUT_S)


class ShopDb:
    def __init__(self, dsn: str, connect: Callable[[str], Awaitable[psycopg.AsyncConnection[DictRow]]] = _connect):
        self._dsn = dsn
        self._connect = connect
        # Set by check(strict=True) when the database could not be checked at startup: the write-privilege check then
        # runs with the first read, and reads are refused while the role can write (fail closed).
        self._verify_before_read = False

    async def _read(self, queries: Sequence[tuple[str, Sequence[Any]]]) -> list[list[dict[str, Any]]]:
        """Run the queries in ONE read-only, repeatable-read transaction (a consistent snapshot)."""
        try:
            conn = await self._connect(self._dsn)
            async with conn:
                await conn.set_read_only(True)
                await conn.set_isolation_level(psycopg.IsolationLevel.REPEATABLE_READ)
                async with conn.cursor() as cur:
                    await cur.execute(f"SET LOCAL statement_timeout = {int(STATEMENT_TIMEOUT_MS)}")
                    results: list[list[dict[str, Any]]] = []
                    for sql, params in queries:
                        await cur.execute(sql, params)
                        results.append(list(await cur.fetchall()))
                    return results
        except errors.UndefinedTable as exc:
            raise ShopReadUnavailable(
                f"analytics views missing: the web app has not created them yet ({_reason(exc)})"
            ) from exc
        except errors.InsufficientPrivilege as exc:
            raise ShopReadUnavailable(
                f"no permission to read the analytics views: run infra/sql/ci_reader.sql ({_reason(exc)})"
            ) from exc
        except psycopg.OperationalError as exc:
            raise ShopReadUnavailable(f"shop database unreachable: {str(exc).strip().splitlines()[0]}") from exc

    async def _checked_read(self, queries: Sequence[tuple[str, Sequence[Any]]]) -> list[list[dict[str, Any]]]:
        if not self._verify_before_read:
            return await self._read(queries)
        write, *results = await self._read([(WRITE_PRIVILEGE_SQL, ()), *queries])
        if write[0]["can_write"]:
            raise ShopReadUnavailable(f"{WRITE_ROLE_MESSAGE}; reads are refused until it does")
        self._verify_before_read = False
        return results

    @staticmethod
    def _snapshot_queries(now: datetime) -> list[tuple[str, Sequence[Any]]]:
        since = now - timedelta(days=RETURNS_WINDOW_DAYS)
        return [(STOCK_SQL, ()), (SOLD_SQL, ()), (RETURNS_SQL, (since,)), (CLEARANCE_SQL, ())]

    async def snapshot(self, now: datetime) -> ShopSnapshot:
        stock, sold, returns, clearance = await self._checked_read(self._snapshot_queries(now))
        return to_snapshot(now, stock, sold, returns, int(clearance[0]["revenue_vnd"] or 0))

    async def kpis(self, names: Sequence[str], now: datetime) -> dict[str, float]:
        values = snapshot_kpis(await self.snapshot(now))
        return {n: values[n] for n in names if n in values}

    async def check(self, strict: bool) -> None:
        """Verify the connection is read-only and the views exist.

        A role that can write is refused when `strict` (production) and logged otherwise. Missing views or an
        unreachable database are only logged: the web app may create them later, and reads then fail clearly.
        """
        try:
            (write,), (missing,) = await self._read([(WRITE_PRIVILEGE_SQL, ()), (MISSING_VIEWS_SQL, (list(VIEWS),))])
        except ShopReadUnavailable as exc:
            logger.warning("shop reads not available yet", reason=str(exc))
            self._verify_before_read = strict
            return
        if write["can_write"]:
            if strict:
                raise RuntimeError(WRITE_ROLE_MESSAGE)
            logger.warning(WRITE_ROLE_MESSAGE + ". Allowed in development only.")
        if missing["missing"]:
            logger.warning("analytics views missing", views=missing["missing"])
