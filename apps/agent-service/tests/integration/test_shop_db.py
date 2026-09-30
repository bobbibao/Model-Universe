"""ShopDb against real views, as the real read-only role created by infra/sql/ci_reader.sql."""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from psycopg import errors, sql
from psycopg.conninfo import make_conninfo

from shop_agent.adapters.growth_rows import GROWTH_VIEWS
from shop_agent.adapters.shop_db import ShopDb
from shop_agent.domain.kpi import DEAD_STOCK_VALUE, RECOVERED_VALUE
from tests.integration.conftest import require_env
from tests.support.factories import NOW

pytestmark = pytest.mark.db

CI_READER_SQL = Path(__file__).resolve().parents[4] / "infra" / "sql" / "ci_reader.sql"
DB, WEB_ROLE, WEB_PASSWORD, READER_PASSWORD = "shop_read_test", "shop_web_test", "webtest", "readtest"

VIEWS = """
CREATE TABLE product (sku text PRIMARY KEY, name text, category text, quantity int, cost int, price int,
                      channel text, stocked_at timestamptz);
INSERT INTO product VALUES ('OLD', 'Áo len', 'Áo len', 10, 300000, 600000, 'web', now() - interval '150 days'),
                           ('NEW', 'Áo thun', 'Áo thun', 5, 100000, 250000, 'web', now() - interval '3 days');
CREATE VIEW analytics.stock_on_hand AS
  SELECT sku, name, category, quantity, cost AS unit_cost_vnd, price AS unit_price_vnd, channel AS sales_channel,
         stocked_at FROM product;
CREATE VIEW analytics.units_sold_30d AS SELECT 'NEW'::text AS sku, 12 AS units;
CREATE VIEW analytics.returns AS
  SELECT 1 AS order_id, 'NEW'::text AS sku, 'size'::text AS reason, 'new'::text AS condition, 2 AS quantity,
         500000 AS refund_vnd, now() - interval '2 days' AS returned_at;
CREATE VIEW analytics.clearance_sales AS SELECT 'OLD'::text AS sku, now() AS sold_at, 480000 AS revenue_vnd;
"""


@pytest.fixture(scope="module")
def dsns() -> Iterator[dict[str, str]]:
    superuser = require_env("PG_SUPERUSER_URL")
    psql = shutil.which("psql")
    if psql is None:
        pytest.fail("psql is needed to run infra/sql/ci_reader.sql")
    with psycopg.connect(superuser, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(DB)))
        exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (WEB_ROLE,)).fetchone()
        if not exists:
            conn.execute(
                sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(sql.Identifier(WEB_ROLE), sql.Literal(WEB_PASSWORD))
            )
        conn.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(DB), sql.Identifier(WEB_ROLE)))
    shop_super = make_conninfo(superuser, dbname=DB)
    subprocess.run(  # noqa: S603 - the repo's own SQL script, test database
        [psql, shop_super, "-q", "-v", f"web_role={WEB_ROLE}", "-v", f"ci_reader_password={READER_PASSWORD}",
         "-f", str(CI_READER_SQL)],
        check=True,
    )  # fmt: skip
    web = make_conninfo(superuser, dbname=DB, user=WEB_ROLE, password=WEB_PASSWORD)
    with psycopg.connect(web, autocommit=True) as conn:
        conn.execute(VIEWS)
    yield {"web": web, "reader": make_conninfo(superuser, dbname=DB, user="ci_reader", password=READER_PASSWORD)}


async def test_reads_the_views_as_the_read_only_role(dsns: dict[str, str]) -> None:
    db = ShopDb(dsns["reader"])
    await db.check(strict=True)
    snap = await db.snapshot(NOW)
    assert {i.sku for i in snap.stock} == {"OLD", "NEW"}
    assert len(snap.returns) == 2 and snap.units_sold_30d == {"NEW": 12}
    kpis = await db.kpis([DEAD_STOCK_VALUE, RECOVERED_VALUE], NOW)
    assert kpis == {DEAD_STOCK_VALUE: 3_000_000, RECOVERED_VALUE: 480_000}


async def test_the_reader_cannot_write(dsns: dict[str, str]) -> None:
    async with await psycopg.AsyncConnection.connect(dsns["reader"]) as conn:
        with pytest.raises((errors.InsufficientPrivilege, errors.ReadOnlySqlTransaction)):
            await conn.execute("INSERT INTO product (sku) VALUES ('X')")


async def test_a_writable_role_is_refused_in_production(dsns: dict[str, str]) -> None:
    with pytest.raises(RuntimeError, match="read-only ci_reader role"):
        await ShopDb(dsns["web"]).check(strict=True)


async def test_check_growth_names_missing_views_and_columns(dsns: dict[str, str]) -> None:
    with psycopg.connect(dsns["web"], autocommit=True) as conn:
        conn.execute(
            "CREATE OR REPLACE VIEW analytics.market_events AS SELECT 'tet'::text AS code, 'Tết'::text AS name"
        )
    problems = await ShopDb(dsns["reader"]).check_growth()
    assert len(problems) == len(GROWTH_VIEWS)  # this database has none of the growth views
    [events] = [p for p in problems if p.startswith("analytics.market_events:")]
    assert "starts_on" in events
