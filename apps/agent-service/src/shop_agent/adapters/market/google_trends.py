"""Google Trends: daily search interest in Vietnam for the owner's keywords (settings `market.trend_keywords`).

Plan decision Q4: the official Trends API is in alpha and has no public client yet, so this reads through `pytrends`
(unofficial, unmaintained since 2023), best effort: one run a day, at most 20 keywords, one keyword per request
(each series is scaled 0-100 on its own), requests at least 10 s apart. A 429 stops the run and marks the source
`degraded`; the `trend_spike` detector only uses data under 7 days old, so a failing source turns it off by itself.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Protocol

from shop_agent.adapters.market.polite import DomainRateLimiter
from shop_agent.domain.growth.market import MarketObservations, SourceName, SourceStatus, TrendObservation
from shop_agent.domain.growth.snapshot import GrowthSnapshot

MAX_KEYWORDS = 20
GEO = "VN"
TIMEFRAME = "today 1-m"  # daily points for the last month
DAYS_SENT = 21  # 20 keywords x 21 days stays within the endpoint's 500 trend points
MAX_CONSECUTIVE_ERRORS = 3
TRENDS_HOST = "trends.google.com"


class RateLimited(Exception):
    """The source answered 429: stop for today."""


class TrendsClient(Protocol):
    def interest_over_time(self, keyword: str) -> list[tuple[date, int]]:
        """Blocking: complete days of interest (0-100) for one keyword in Vietnam."""
        ...


class PytrendsClient:
    """One Google session per run (pytrends reads Google's cookies when it starts)."""

    def __init__(self) -> None:
        self._client: Any = None

    def interest_over_time(self, keyword: str) -> list[tuple[date, int]]:
        from pytrends.exceptions import TooManyRequestsError
        from pytrends.request import TrendReq

        try:
            if self._client is None:
                self._client = TrendReq(hl="vi-VN", tz=-420, timeout=(5, 20))  # tz: minutes west of UTC
            self._client.build_payload([keyword], timeframe=TIMEFRAME, geo=GEO)
            frame = self._client.interest_over_time()
        except TooManyRequestsError as exc:
            raise RateLimited(str(exc)) from exc
        if frame.empty:
            return []
        return [
            (stamp.date(), int(row[keyword]))
            for stamp, row in frame.iterrows()
            if not bool(row.get("isPartial", False))
        ]


@dataclass
class GoogleTrendsCollector:
    source: SourceName = field(default="trends", init=False)
    client_factory: Callable[[], TrendsClient] = PytrendsClient
    limiter_factory: Callable[[], DomainRateLimiter] = DomainRateLimiter

    async def collect(self, snapshot: GrowthSnapshot) -> MarketObservations:
        keywords = [k.keyword for k in snapshot.settings.trend_keywords][:MAX_KEYWORDS]
        if not keywords:
            return MarketObservations(
                source="trends", observed_at=snapshot.taken_at, detail="chưa có từ khoá xu hướng trong cài đặt"
            )
        client, limiter = self.client_factory(), self.limiter_factory()
        first_day = snapshot.today - timedelta(days=DAYS_SENT)
        points: list[TrendObservation] = []
        failed: list[str] = []
        status: SourceStatus = "ok"
        errors_in_a_row = 0
        for index, keyword in enumerate(keywords):
            await limiter.wait(TRENDS_HOST)
            try:
                series = await asyncio.to_thread(client.interest_over_time, keyword)
            except RateLimited:
                status = "degraded"
                failed += keywords[index:]
                break
            except Exception:  # an unofficial client: any failure degrades the source
                status, errors_in_a_row = "degraded", errors_in_a_row + 1
                failed.append(keyword)
                if errors_in_a_row >= MAX_CONSECUTIVE_ERRORS:
                    failed += keywords[index + 1 :]
                    break
                continue
            errors_in_a_row = 0
            points += [
                TrendObservation(keyword=keyword, geo=GEO, date=day, interest=min(100, max(0, interest)))
                for day, interest in series
                if first_day <= day < snapshot.today
            ]
        detail = f"{len(keywords) - len(failed)}/{len(keywords)} từ khoá, {len(points)} điểm"
        if failed:
            detail += f"; lỗi hoặc bị giới hạn (429): {', '.join(failed)}"
        return MarketObservations(
            source="trends", status=status, observed_at=snapshot.taken_at, detail=detail[:1000], trends=tuple(points)
        )
