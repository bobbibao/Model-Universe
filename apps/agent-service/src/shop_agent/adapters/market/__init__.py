"""Market collectors (docs/GROWTH_AGENT.md, "Data sources"): each reads one outside source and returns the day's
MarketObservations, which the `collect` graph posts to the web (`POST /market/observations`).

- `fixture`: deterministic observations for development and CI (no network).
- `google_trends`: search interest in Vietnam for the owner's keywords (pytrends, best effort).
- `competitor_sites`: public product pages on competitors' own storefronts that an admin asked to watch. Marketplaces
  are never read (`polite.MARKETPLACE_DENYLIST`); robots.txt, a per-domain rate limit and a daily cap always apply.
"""

from __future__ import annotations

from typing import Protocol

from shop_agent.domain.growth.market import MarketObservations, SourceName
from shop_agent.domain.growth.snapshot import GrowthSnapshot


class MarketCollector(Protocol):
    source: SourceName

    async def collect(self, snapshot: GrowthSnapshot) -> MarketObservations:
        """Read the source for `snapshot.taken_at`. Failures become the observations' status, never an exception."""
        ...
