"""Exploratory SQL over the `analytics` views, for the copilot's `analyst` subagent.

Same role and the same restrictions as `ShopDb` (the read-only `ci_reader`): every call is one read-only transaction
with the statement timeout and `analytics` as the only schema on the search path, and a query returns at most
`MAX_ROWS` rows. LangChain's `SQLDatabase` lives in the sunset `langchain-community`; listing the views, describing
them and running a query are all the analyst needs.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import psycopg
from psycopg import sql
from psycopg.rows import DictRow, dict_row

from shop_agent.adapters.shop_db import CONNECT_TIMEOUT_S, STATEMENT_TIMEOUT_MS

SCHEMA = "analytics"
MAX_ROWS = 200
SAMPLE_ROWS = 3
MAX_VALUE_CHARS = 300

VIEWS_SQL = "SELECT table_name FROM information_schema.views WHERE table_schema = %s ORDER BY table_name"
COLUMNS_SQL = (
    "SELECT table_name, column_name, data_type FROM information_schema.columns "
    "WHERE table_schema = %s AND table_name = ANY(%s) ORDER BY table_name, ordinal_position"
)


def capped(query: str) -> str:
    """The query as a subquery with the row cap (one more row tells that rows were cut): one SELECT (or WITH ...
    SELECT) statement, nothing else. Running the model's SQL is the point; the read-only role and transaction are
    what make it safe."""
    return f"SELECT * FROM ({query.strip().rstrip(';')}) AS analyst_query LIMIT {MAX_ROWS + 1}"  # noqa: S608


def format_rows(rows: Sequence[dict[str, Any]]) -> str:
    """One JSON object per line; long values are cut."""

    def cell(value: Any) -> Any:
        if isinstance(value, str | bytes) and len(value) > MAX_VALUE_CHARS:
            return f"{value[:MAX_VALUE_CHARS]!s}..."
        return value

    return "\n".join(json.dumps({k: cell(v) for k, v in row.items()}, ensure_ascii=False, default=str) for row in rows)


class SqlError(Exception):
    """The database refused or failed the statement; the message (PostgreSQL's) is safe to show the model."""


class AnalyticsSql:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    async def _run(self, statement: str | sql.Composed, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
        try:
            conn: psycopg.AsyncConnection[DictRow] = await psycopg.AsyncConnection.connect(
                self._dsn, row_factory=dict_row, connect_timeout=CONNECT_TIMEOUT_S
            )
            async with conn:
                await conn.set_read_only(True)
                async with conn.transaction(), conn.cursor() as cur:
                    await cur.execute(f"SET LOCAL statement_timeout = {int(STATEMENT_TIMEOUT_MS)}")
                    await cur.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(SCHEMA)))
                    await cur.execute(statement, params)
                    return list(await cur.fetchall()) if cur.description else []
        except psycopg.Error as exc:
            raise SqlError(exc.diag.message_primary or str(exc) or type(exc).__name__) from exc

    async def views(self) -> list[str]:
        return [str(row["table_name"]) for row in await self._run(VIEWS_SQL, (SCHEMA,))]

    async def describe(self, names: Sequence[str]) -> str:
        """Columns and a few sample rows of each named view (unknown names are reported, never queried)."""
        known = set(await self.views())
        wanted = [n for n in dict.fromkeys(names) if n in known]
        columns = await self._run(COLUMNS_SQL, (SCHEMA, wanted)) if wanted else []
        parts = [f"Unknown views: {', '.join(sorted(set(names) - known))}"] if set(names) - known else []
        for view in wanted:
            described = ", ".join(f"{c['column_name']} {c['data_type']}" for c in columns if c["table_name"] == view)
            sample = await self._run(
                sql.SQL("SELECT * FROM {} LIMIT {}").format(sql.Identifier(SCHEMA, view), sql.Literal(SAMPLE_ROWS))
            )
            parts.append(f"{view}({described})\nSample rows:\n{format_rows(sample) or '(none)'}")
        return "\n\n".join(parts)

    async def query(self, query: str) -> tuple[list[dict[str, Any]], bool]:
        """The rows (at most MAX_ROWS) and whether more were cut."""
        rows = await self._run(capped(query))
        return rows[:MAX_ROWS], len(rows) > MAX_ROWS
