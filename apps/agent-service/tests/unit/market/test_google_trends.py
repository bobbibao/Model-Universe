"""The Google Trends collector over a scripted client: keyword cap, window, 429 and error handling."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from shop_agent.adapters.market.google_trends import DAYS_SENT, MAX_KEYWORDS, GoogleTrendsCollector, RateLimited
from shop_agent.adapters.market.polite import DomainRateLimiter
from shop_agent.domain.growth.snapshot import vn_date
from tests.unit.market.conftest import NOW, FakeClock, snapshot

TODAY = vn_date(NOW)


@dataclass
class ScriptedTrends:
    failures: dict[str, Exception] = field(default_factory=dict)
    asked: list[str] = field(default_factory=list)

    def interest_over_time(self, keyword: str) -> list[tuple[date, int]]:
        self.asked.append(keyword)
        if keyword in self.failures:
            raise self.failures[keyword]
        return [(TODAY - timedelta(days=n), 40 + n) for n in range(0, 31)]


def collector(client: ScriptedTrends, limiter: DomainRateLimiter) -> GoogleTrendsCollector:
    return GoogleTrendsCollector(client_factory=lambda: client, limiter_factory=lambda: limiter)


async def test_reads_complete_days_of_the_window(limiter: DomainRateLimiter) -> None:
    found = await collector(ScriptedTrends(), limiter).collect(snapshot(keywords=("áo khoác",)))
    assert found.status == "ok" and found.source == "trends"
    days = sorted(p.date for p in found.trends)
    assert days[0] == TODAY - timedelta(days=DAYS_SENT) and days[-1] == TODAY - timedelta(days=1)
    assert all(p.geo == "VN" and p.keyword == "áo khoác" for p in found.trends)


async def test_at_most_twenty_keywords_spaced_apart(clock: FakeClock, limiter: DomainRateLimiter) -> None:
    client = ScriptedTrends()
    keywords = tuple(f"từ khoá {n}" for n in range(25))
    found = await collector(client, limiter).collect(snapshot(keywords=keywords))
    assert client.asked == list(keywords[:MAX_KEYWORDS])
    assert len(found.trends) == MAX_KEYWORDS * DAYS_SENT <= 500  # the endpoint's limit
    assert clock.sleeps == [10.0] * (MAX_KEYWORDS - 1)


async def test_429_stops_the_run_and_degrades(limiter: DomainRateLimiter) -> None:
    client = ScriptedTrends(failures={"b": RateLimited("429")})
    found = await collector(client, limiter).collect(snapshot(keywords=("a", "b", "c")))
    assert client.asked == ["a", "b"] and found.status == "degraded"
    assert {p.keyword for p in found.trends} == {"a"} and "b, c" in (found.detail or "")


async def test_errors_degrade_and_three_in_a_row_stop(limiter: DomainRateLimiter) -> None:
    client = ScriptedTrends(failures={k: ValueError("bad response") for k in ("b", "c", "d")})
    found = await collector(client, limiter).collect(snapshot(keywords=("a", "b", "c", "d", "e")))
    assert client.asked == ["a", "b", "c", "d"] and found.status == "degraded"


async def test_no_keywords_asks_nothing(limiter: DomainRateLimiter) -> None:
    client = ScriptedTrends()
    found = await collector(client, limiter).collect(snapshot())
    assert client.asked == [] and found.status == "ok" and found.trends == ()
