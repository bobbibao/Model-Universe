"""Exploratory SQL over the `analytics` views, for the copilot's `analyst` subagent only (docs/ARCHITECTURE.md
section 6.5): the read-only role, the `analytics` schema, a statement timeout and a row cap (`adapters/analytics_sql`).
The views hold no customer data.
"""

from __future__ import annotations

from langchain.tools import tool

from shop_agent.adapters.analytics_sql import MAX_ROWS, AnalyticsSql, SqlError, format_rows
from shop_agent.tools.deps import ShopToolRuntime, get_deps

UNAVAILABLE = "ERROR: SQL is not available here (no SHOP_READ_DSN); use the other read tools."


async def _database(runtime: ShopToolRuntime) -> AnalyticsSql | None:
    return (await get_deps(runtime)).analytics


@tool
async def sql_db_list_tables(runtime: ShopToolRuntime) -> str:
    """List the analytics views you can query (comma-separated)."""
    db = await _database(runtime)
    if db is None:
        return UNAVAILABLE
    try:
        return ", ".join(await db.views())
    except SqlError as exc:
        return f"ERROR: {exc}"


@tool
async def sql_db_schema(table_names: str, runtime: ShopToolRuntime) -> str:
    """The columns and 3 sample rows of these views (comma-separated names, from sql_db_list_tables)."""
    db = await _database(runtime)
    if db is None:
        return UNAVAILABLE
    try:
        return await db.describe([name.strip() for name in table_names.split(",") if name.strip()])
    except SqlError as exc:
        return f"ERROR: {exc}"


@tool
async def sql_db_query(query: str, runtime: ShopToolRuntime) -> str:
    """Run one read-only PostgreSQL SELECT on the analytics views and return the rows, one JSON object per line (at
    most 200: aggregate in SQL rather than reading many rows). Money columns are whole VND. On an error, read it, fix
    the query and try again."""
    db = await _database(runtime)
    if db is None:
        return UNAVAILABLE
    try:
        rows, cut = await db.query(query)
    except SqlError as exc:
        return f"ERROR: {exc}"
    if not rows:
        return "(no rows)"
    return format_rows(rows) + (f"\n(only the first {MAX_ROWS} rows: aggregate in SQL)" if cut else "")


SQL_TOOLS = [sql_db_list_tables, sql_db_schema, sql_db_query]
