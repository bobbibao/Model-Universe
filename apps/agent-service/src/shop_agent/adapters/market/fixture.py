"""The fixture source: deterministic observations with no network (development, CI, `collect --dry-run`).

It continues what the shop already knows: one more day of interest per configured keyword, and a fresh reading of
the latest competitor prices that no collector watches (prices move by at most 3%). Watched pages are left to
`competitor_sites`, so a fixture run never changes the watch list.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import timedelta

from shop_agent.adapters.market.polite import DAILY_PAGE_CAP
from shop_agent.domain.growth.market import MarketObservations, PriceObservation, SourceName, TrendObservation
from shop_agent.domain.growth.snapshot import GrowthSnapshot

MAX_KEYWORDS = 20
BASE_INTEREST = 40


def _roll(*parts: str) -> int:
    """A stable number in [0, 1000) for the given parts."""
    return int.from_bytes(hashlib.sha256("|".join(parts).encode()).digest()[:4], "big") % 1000


@dataclass
class FixtureCollector:
    source: SourceName = field(default="fixture", init=False)
    page_cap: int = DAILY_PAGE_CAP

    async def collect(self, snapshot: GrowthSnapshot) -> MarketObservations:
        day = snapshot.today - timedelta(days=1)  # the last complete day
        trends = []
        for keyword in snapshot.settings.trend_keywords[:MAX_KEYWORDS]:
            series = snapshot.trend_series(keyword.keyword)
            last = series[-1].interest if series else BASE_INTEREST
            step = _roll(keyword.keyword, day.isoformat()) % 7 - 3
            trends.append(TrendObservation(keyword=keyword.keyword, date=day, interest=min(100, max(0, last + step))))
        prices = []
        unwatched = [(p, p.url) for p in snapshot.latest_competitor_prices() if p.url and not p.watch]
        for price, url in unwatched[: self.page_cap]:
            change = (_roll(url, day.isoformat()) % 7 - 3) / 100
            prices.append(
                PriceObservation(
                    competitor=price.competitor,
                    sku=price.sku,
                    url=url,
                    title=price.title,
                    price_vnd=max(1_000, round(price.price_vnd * (1 + change) / 1_000) * 1_000),
                    confidence=price.confidence,
                )
            )
        return MarketObservations(
            source="fixture",
            observed_at=snapshot.taken_at,
            detail=f"fixture: {len(trends)} từ khoá, {len(prices)} giá",
            trends=tuple(trends),
            competitor_prices=tuple(prices),
        )
