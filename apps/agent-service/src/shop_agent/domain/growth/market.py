"""Market observations: what a collector reports to the web (`POST /market/observations`, ingestion class).

The body mirrors packages/contracts/openapi/web-agent-api.yaml. Collected text (titles, campaign copy) is untrusted
data: it is stored and shown, never followed.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from shop_agent.domain.growth.snapshot import vn_date

MARKET_OBSERVATIONS_ENDPOINT = "market/observations"
SourceName = Literal["trends", "competitor_sites", "fixture"]
SourceStatus = Literal["ok", "degraded", "blocked", "off"]


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class TrendObservation(_Body):
    keyword: str = Field(min_length=1, max_length=100)
    geo: str = "VN"
    date: dt.date
    interest: int = Field(ge=0, le=100)


class PriceObservation(_Body):
    competitor: str
    sku: str | None = None
    url: str
    title: str | None = Field(default=None, max_length=200)
    price_vnd: int = Field(ge=1)
    observed_at: dt.datetime | None = None
    confidence: float = Field(default=1, ge=0, le=1)


class CampaignObservation(_Body):
    competitor: str
    title: str = Field(max_length=200)
    category: str | None = None
    discount_pct: float | None = Field(default=None, gt=0, le=100)
    starts_at: dt.datetime | None = None
    ends_at: dt.datetime | None = None
    url: str | None = None


class MarketObservations(_Body):
    source: SourceName
    status: SourceStatus = "ok"
    detail: str | None = Field(default=None, max_length=1000)
    observed_at: dt.datetime
    trends: tuple[TrendObservation, ...] = Field(default=(), max_length=500)
    competitor_prices: tuple[PriceObservation, ...] = Field(default=(), max_length=500)
    competitor_campaigns: tuple[CampaignObservation, ...] = Field(default=(), max_length=100)

    def body(self) -> dict[str, object]:
        """The request body (JSON types, absent fields left out)."""
        return self.model_dump(mode="json", exclude_none=True)

    def idempotency_key(self) -> str:
        """`collect:{source}:{date}` (the day in Vietnam): one post per source per day (docs/GROWTH_AGENT.md)."""
        return f"collect:{self.source}:{vn_date(self.observed_at).isoformat()}"
