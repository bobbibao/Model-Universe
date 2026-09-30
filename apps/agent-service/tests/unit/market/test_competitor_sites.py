"""The competitor-site collector: what it must never request, and how failures become the source's status."""

from __future__ import annotations

from shop_agent.adapters.market.competitor_sites import CompetitorSitesCollector, FetchedPage
from shop_agent.adapters.market.pages import load_selectors
from shop_agent.adapters.market.polite import DomainRateLimiter
from tests.unit.market.conftest import (
    CAPTCHA_HTML,
    PRODUCT_HTML,
    FakeClock,
    ScriptedFetcher,
    snapshot,
    watched,
)

A = "https://an-nhien.example"


def collector(fetcher: ScriptedFetcher, limiter: DomainRateLimiter, **kwargs: int) -> CompetitorSitesCollector:
    return CompetitorSitesCollector(
        fetcher_factory=lambda: fetcher, selectors=load_selectors(), limiter_factory=lambda: limiter, **kwargs
    )


async def test_reads_watched_pages(limiter: DomainRateLimiter) -> None:
    fetcher = ScriptedFetcher(pages={f"{A}/p/1": FetchedPage(200, PRODUCT_HTML)})
    found = await collector(fetcher, limiter).collect(snapshot(watched(f"{A}/p/1")))
    assert found.status == "ok" and fetcher.closed
    [price] = found.competitor_prices
    assert (price.competitor, price.sku, price.url, price.price_vnd) == (
        "Thời Trang An Nhiên",
        "SKU-1",
        f"{A}/p/1",
        349_000,
    )
    assert found.idempotency_key() == "collect:competitor_sites:2026-09-30"  # 06:45 in Vietnam


async def test_robots_disallow_means_no_request(limiter: DomainRateLimiter) -> None:
    fetcher = ScriptedFetcher(
        pages={f"{A}/private/1": FetchedPage(200, PRODUCT_HTML)},
        robots_files={f"{A}/robots.txt": (200, "User-agent: *\nDisallow: /private\n")},
    )
    found = await collector(fetcher, limiter).collect(snapshot(watched(f"{A}/private/1")))
    assert fetcher.requested == [f"{A}/robots.txt"]
    assert found.competitor_prices == () and "robots.txt" in (found.detail or "")


async def test_marketplace_urls_are_never_requested_even_when_watched(limiter: DomainRateLimiter) -> None:
    urls = ["https://shopee.vn/a-i.1.2", "https://www.lazada.vn/products/b.html", "https://tiki.vn/c"]
    fetcher = ScriptedFetcher(pages={url: FetchedPage(200, PRODUCT_HTML) for url in urls})
    found = await collector(fetcher, limiter).collect(
        snapshot(*(watched(url, sku=f"S{i}") for i, url in enumerate(urls)))
    )
    assert fetcher.requested == [] and found.competitor_prices == ()
    assert "3 sàn TMĐT" in (found.detail or "")


async def test_requests_to_one_domain_are_spaced(clock: FakeClock, limiter: DomainRateLimiter) -> None:
    pages = {f"{A}/p/{n}": FetchedPage(200, PRODUCT_HTML) for n in range(3)}
    fetcher = ScriptedFetcher(pages=pages)
    found = await collector(fetcher, limiter).collect(
        snapshot(*(watched(url, sku=f"S{i}") for i, url in enumerate(pages)))
    )
    assert len(found.competitor_prices) == 3
    # robots.txt, then three pages: every request after the first waited out the 10 s interval
    assert clock.sleeps == [10.0, 10.0, 10.0]


# The watch list is read in (competitor, SKU, URL) order: these SKUs put the first page first.


async def test_captcha_blocks_the_source_and_stops(limiter: DomainRateLimiter) -> None:
    other = "https://phongcachsaigon.example"
    fetcher = ScriptedFetcher(
        pages={f"{A}/p/1": FetchedPage(200, CAPTCHA_HTML), f"{other}/p/2": FetchedPage(200, PRODUCT_HTML)}
    )
    found = await collector(fetcher, limiter).collect(
        snapshot(watched(f"{A}/p/1", sku="S1"), watched(f"{other}/p/2", sku="S2"))
    )
    assert found.status == "blocked" and found.competitor_prices == ()
    assert f"{other}/p/2" not in fetcher.requested  # stopped: no other site was read
    assert "an-nhien.example" in (found.detail or "")


async def test_429_degrades_the_source_and_skips_that_site(limiter: DomainRateLimiter) -> None:
    other = "https://phongcachsaigon.example"
    fetcher = ScriptedFetcher(
        pages={
            f"{A}/p/1": FetchedPage(429, "slow down"),
            f"{A}/p/2": FetchedPage(200, PRODUCT_HTML),
            f"{other}/p/3": FetchedPage(200, PRODUCT_HTML),
        }
    )
    found = await collector(fetcher, limiter).collect(
        snapshot(watched(f"{A}/p/1", sku="S1"), watched(f"{A}/p/2", sku="S2"), watched(f"{other}/p/3", sku="S3"))
    )
    assert found.status == "degraded"
    assert f"{A}/p/2" not in fetcher.requested
    assert [p.url for p in found.competitor_prices] == [f"{other}/p/3"]


async def test_unreachable_pages_and_missing_prices(limiter: DomainRateLimiter) -> None:
    fetcher = ScriptedFetcher(
        pages={f"{A}/p/1": TimeoutError("page.goto timeout"), f"{A}/p/2": FetchedPage(200, "<h1>Hết hàng</h1>")}
    )
    found = await collector(fetcher, limiter).collect(snapshot(watched(f"{A}/p/1"), watched(f"{A}/p/2", sku="S2")))
    assert found.status == "degraded" and found.competitor_prices == ()
    assert "không truy cập được" in (found.detail or "") and "không tìm thấy giá" in (found.detail or "")


async def test_daily_page_cap(limiter: DomainRateLimiter) -> None:
    pages = {f"{A}/p/{n}": FetchedPage(200, PRODUCT_HTML) for n in range(3)}
    fetcher = ScriptedFetcher(pages=pages)
    found = await collector(fetcher, limiter, page_cap=2).collect(
        snapshot(*(watched(url, sku=f"S{i}") for i, url in enumerate(pages)))
    )
    assert len(found.competitor_prices) == 2 and "vượt giới hạn" in (found.detail or "")


async def test_nothing_watched_reads_nothing(limiter: DomainRateLimiter) -> None:
    fetcher = ScriptedFetcher()
    found = await collector(fetcher, limiter).collect(snapshot())
    assert found.status == "ok" and fetcher.requested == []


async def test_a_browser_that_cannot_start_stops_the_run(limiter: DomainRateLimiter) -> None:
    from shop_agent.adapters.market.competitor_sites import BrowserUnavailable

    fetcher = ScriptedFetcher(pages={f"{A}/p/1": BrowserUnavailable("Executable doesn't exist")})
    found = await collector(fetcher, limiter).collect(
        snapshot(watched(f"{A}/p/1", sku="S1"), watched(f"{A}/p/2", sku="S2"))
    )
    assert found.status == "degraded" and fetcher.closed
    assert f"{A}/p/2" not in fetcher.requested and "trình duyệt" in (found.detail or "")
