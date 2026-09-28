"""ShopReadPort over read-only SQL views (TO IMPLEMENT - docs/ROADMAP.md T-03).

Read from the web app's `analytics` schema through a read-only role (never the transactional tables):
  analytics.stock_on_hand, analytics.returns, analytics.units_sold_30d, analytics.feedback
Map rows to domain types (StockItem, ReturnRecord, ...) here; the domain must not see the web schema.
Provide `kpis()` with the same definitions FakeShop uses (see domain/kpi.py) so Measure is comparable.
"""
from __future__ import annotations

from typing import Sequence

from ci_agent.domain.models.shop import ShopSnapshot


class SqlShopReadAdapter:
    def __init__(self, dsn: str) -> None:
        raise NotImplementedError("ROADMAP T-03")

    def snapshot(self) -> ShopSnapshot:
        raise NotImplementedError

    def kpis(self, names: Sequence[str]) -> dict[str, float]:
        raise NotImplementedError
