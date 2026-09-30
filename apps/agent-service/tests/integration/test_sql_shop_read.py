"""SqlShopReadAdapter against a real, seeded apps/web-ecommerce database, as the real read-only role.

Skipped unless SHOP_READ_TEST_DSN is set, e.g.
    SHOP_READ_TEST_DSN=postgresql://ci_reader:<password>@localhost:5432/web_ecommerce_ci_verify
The database must be seeded (`yarn seed-dev`) and the role created by infra/sql/ci_reader.sql. Read-only: this
test writes nothing (its write attempts must fail).
"""
from __future__ import annotations

import os
from datetime import timedelta

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from ci_agent.domain.detectors.base import default_detectors
from ci_agent.domain.kpi import KPI_CATALOG
from ci_agent.infrastructure.shop.sql_read import (
    RETURNS_WINDOW_DAYS,
    ShopReadUnavailable,
    SqlShopReadAdapter,
)
from ci_agent.infrastructure.system.clock import SystemClock

DSN = os.environ.get("SHOP_READ_TEST_DSN", "")
pytestmark = pytest.mark.skipif(not DSN, reason="set SHOP_READ_TEST_DSN to run")


@pytest.fixture(scope="module")
def adapter() -> SqlShopReadAdapter:
    return SqlShopReadAdapter(DSN, SystemClock(), 25_000.0)


def test_snapshot_maps_the_seeded_shop(adapter):
    snapshot = adapter.snapshot()
    assert snapshot.stock, "stock_on_hand should list the sellable products"
    assert all(i.quantity >= 0 and i.days_in_stock >= 0 and i.channel in ("web", "outlet") for i in snapshot.stock)
    assert all(i.unit_cost > 0 and i.unit_price >= i.unit_cost for i in snapshot.stock)  # VND converted to units
    oldest = snapshot.taken_at - timedelta(days=RETURNS_WINDOW_DAYS)
    assert snapshot.returns and all(r.returned_at >= oldest for r in snapshot.returns)
    assert snapshot.units_sold_30d and snapshot.feedback == ()


def test_both_live_signals_fire_on_the_seeded_data(adapter):
    snapshot = adapter.snapshot()
    kinds = {s.kind for d in default_detectors() for s in d.detect(snapshot, snapshot.taken_at)}
    assert {"dead_stock", "high_returns"} <= kinds
    assert "near_expiry" not in kinds


def test_kpis_cover_the_catalog(adapter):
    kpis = adapter.kpis(list(KPI_CATALOG))
    assert set(kpis) == set(KPI_CATALOG)
    assert kpis["dead_stock_value"] > 0 and kpis["return_rate_pct"] > 0


def test_the_role_is_read_only(adapter):
    adapter.check(strict=True)  # raises when the role could write to shop tables
    denied = (psycopg.errors.InsufficientPrivilege, psycopg.errors.ReadOnlySqlTransaction)
    with psycopg.connect(DSN) as conn, conn.cursor() as cur, pytest.raises(denied):
        cur.execute("UPDATE public.product SET stock = stock")
    with psycopg.connect(DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("SET default_transaction_read_only = off")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("CREATE TABLE analytics.not_allowed (id int)")


def test_missing_views_are_reported_clearly():
    # Same role, a database without the analytics views (the web app never started there).
    other_db = make_conninfo(**{**conninfo_to_dict(DSN), "dbname": "postgres"})
    with pytest.raises(ShopReadUnavailable, match="analytics views missing"):
        SqlShopReadAdapter(other_db, SystemClock(), 25_000.0).snapshot()
