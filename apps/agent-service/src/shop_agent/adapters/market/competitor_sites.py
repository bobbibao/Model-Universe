"""Competitor storefronts: prices on the public product pages an admin asked to watch (plan decision Q3).

Only competitors' own sites. Every page follows `polite`: marketplaces are never requested, robots.txt is read first,
requests to a domain are at least 10 s apart, at most `DAILY_PAGE_CAP` pages a run, an identifying user agent, and a
fresh browser context per run (no login, no cookies kept). A CAPTCHA or bot check stops the run: the source becomes
`blocked` until someone looks at it. A 429 marks the source `degraded` and skips that site for the day.

Pages are rendered with Playwright (many storefronts fill prices in with JavaScript) and parsed with selectolax.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from shop_agent.adapters.market.pages import SelectorConfig, load_selectors, read_product_page
from shop_agent.adapters.market.polite import (
    DAILY_PAGE_CAP,
    USER_AGENT,
    DomainRateLimiter,
    RobotsPolicy,
    host_of,
    is_challenge,
    is_denied,
    is_http_url,
)
from shop_agent.domain.growth.market import MarketObservations, PriceObservation, SourceName, SourceStatus
from shop_agent.domain.growth.snapshot import GrowthSnapshot

PAGE_TIMEOUT_MS = 30_000
ROBOTS_TIMEOUT_S = 10.0
SKIPPED_RESOURCES = frozenset({"image", "media", "font"})  # not needed to read a price


@dataclass(frozen=True)
class FetchedPage:
    status: int
    html: str


class BrowserUnavailable(Exception):
    """The browser could not start: no page can be read this run."""


class PageFetcher(Protocol):
    async def robots(self, url: str) -> tuple[int, str]: ...

    async def page(self, url: str) -> FetchedPage: ...

    async def aclose(self) -> None: ...


class PlaywrightFetcher:
    """robots.txt over HTTP; product pages in headless Chromium, started on the first page and closed after the run.

    `executable_path`: a Chromium to use instead of Playwright's own download (MARKET_CHROMIUM_PATH).
    """

    def __init__(self, executable_path: str | None = None) -> None:
        self._executable_path = executable_path
        self._http = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT}, timeout=ROBOTS_TIMEOUT_S, follow_redirects=True
        )
        self._playwright: Any = None
        self._browser: Any = None
        self._context: Any = None

    async def robots(self, url: str) -> tuple[int, str]:
        response = await self._http.get(url)
        return response.status_code, response.text

    async def _page_context(self) -> Any:
        if self._context is None:
            from playwright.async_api import async_playwright

            self._playwright = await async_playwright().start()
            try:
                self._browser = await self._playwright.chromium.launch(
                    headless=True, executable_path=self._executable_path
                )
            except Exception as exc:  # e.g. the browser is not installed (`playwright install chromium`)
                raise BrowserUnavailable(str(exc).splitlines()[0]) from exc
            self._context = await self._browser.new_context(user_agent=USER_AGENT, locale="vi-VN")

            async def skip_heavy(route: Any) -> None:
                if route.request.resource_type in SKIPPED_RESOURCES:
                    await route.abort()
                else:
                    await route.continue_()

            await self._context.route("**/*", skip_heavy)
        return self._context

    async def page(self, url: str) -> FetchedPage:
        context = await self._page_context()
        page = await context.new_page()
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
            return FetchedPage(response.status if response is not None else 0, await page.content())
        finally:
            await page.close()

    async def aclose(self) -> None:
        await self._http.aclose()
        if self._context is not None:
            await self._context.close()
        if self._browser is not None:
            await self._browser.close()
        if self._playwright is not None:
            await self._playwright.stop()
        self._context = self._browser = self._playwright = None


# Why a watched page was not read or gave no price, as shown to the admins (Vietnamese).
SKIP_MARKETPLACE = "sàn TMĐT (không bao giờ đọc)"
SKIP_INVALID_URL = "URL không hợp lệ"
SKIP_ROBOTS = "robots.txt không cho phép"
SKIP_CAP = "vượt giới hạn trang mỗi ngày"
SKIP_RATE_LIMITED_SITE = "trang bị giới hạn (429) hôm nay"
SKIP_AFTER_BLOCK = "dừng sau khi bị chặn"
PROBLEM_RATE_LIMITED = "bị giới hạn (429)"
PROBLEM_UNREACHABLE = "không truy cập được"
PROBLEM_BROWSER = "không khởi động được trình duyệt"
PROBLEM_SERVER = "lỗi máy chủ (5xx)"
PROBLEM_NOT_FOUND = "trang lỗi (4xx)"
PROBLEM_NO_PRICE = "không tìm thấy giá"


@dataclass
class CompetitorSitesCollector:
    source: SourceName = field(default="competitor_sites", init=False)
    fetcher_factory: Callable[[], PageFetcher] = PlaywrightFetcher
    selectors: SelectorConfig | None = None  # data/market/selectors.yaml, read on first use
    limiter_factory: Callable[[], DomainRateLimiter] = DomainRateLimiter
    page_cap: int = DAILY_PAGE_CAP

    async def collect(self, snapshot: GrowthSnapshot) -> MarketObservations:
        watched = snapshot.watch_list()
        if not watched:
            return MarketObservations(
                source="competitor_sites", observed_at=snapshot.taken_at, detail="chưa có trang nào được theo dõi"
            )
        if self.selectors is None:
            self.selectors = await asyncio.to_thread(load_selectors)
        fetcher, limiter = self.fetcher_factory(), self.limiter_factory()

        async def read_robots(robots_url: str) -> tuple[int, str]:
            await limiter.wait(host_of(robots_url))
            return await fetcher.robots(robots_url)

        robots = RobotsPolicy(read_robots)
        prices: list[PriceObservation] = []
        skipped: Counter[str] = Counter()
        problems: Counter[str] = Counter()
        status: SourceStatus = "ok"
        rate_limited: set[str] = set()
        blocked_host: str | None = None
        pages = 0
        try:
            for entry in watched:
                url = entry.url or ""
                host = host_of(url)
                if blocked_host is not None:
                    skipped[SKIP_AFTER_BLOCK] += 1
                elif not is_http_url(url):
                    skipped[SKIP_INVALID_URL] += 1
                elif is_denied(url):
                    skipped[SKIP_MARKETPLACE] += 1
                elif host in rate_limited:
                    skipped[SKIP_RATE_LIMITED_SITE] += 1
                elif pages >= self.page_cap:
                    skipped[SKIP_CAP] += 1
                elif not await robots.allowed(url):
                    skipped[SKIP_ROBOTS] += 1
                else:
                    await limiter.wait(host)
                    pages += 1
                    try:
                        page = await fetcher.page(url)
                    except BrowserUnavailable:
                        problems[PROBLEM_BROWSER] += 1
                        status = "degraded"
                        break
                    except Exception:  # timeouts, DNS, TLS, browser errors: the page is unreachable
                        problems[PROBLEM_UNREACHABLE] += 1
                        status = "degraded"
                        continue
                    if is_challenge(page.status, page.html):
                        blocked_host = host
                        status = "blocked"
                    elif page.status == 429:
                        rate_limited.add(host)
                        problems[PROBLEM_RATE_LIMITED] += 1
                        status = "degraded"
                    elif page.status >= 500 or page.status == 0:
                        problems[PROBLEM_SERVER] += 1
                        status = "degraded"
                    elif page.status >= 400:
                        problems[PROBLEM_NOT_FOUND] += 1
                    else:
                        parsed = read_product_page(page.html, host, self.selectors)
                        if parsed.price_vnd is None:
                            problems[PROBLEM_NO_PRICE] += 1
                        else:
                            prices.append(
                                PriceObservation(
                                    competitor=entry.competitor,
                                    sku=entry.sku,
                                    url=url,
                                    title=parsed.title,
                                    price_vnd=parsed.price_vnd,
                                    confidence=parsed.confidence,
                                )
                            )
        finally:
            await fetcher.aclose()
        return MarketObservations(
            source="competitor_sites",
            status=status,
            observed_at=snapshot.taken_at,
            detail=_detail(len(prices), pages, skipped, problems, blocked_host),
            competitor_prices=tuple(prices),
        )


def _detail(prices: int, pages: int, skipped: Counter[str], problems: Counter[str], blocked_host: str | None) -> str:
    parts = [f"{prices} giá từ {pages} trang"]
    if blocked_host:
        parts.append(f"bị chặn (CAPTCHA/kiểm tra bot) tại {blocked_host}: đã dừng")
    if problems:
        parts.append("sự cố: " + ", ".join(f"{count} {reason}" for reason, count in problems.most_common()))
    if skipped:
        parts.append("bỏ qua: " + ", ".join(f"{count} {reason}" for reason, count in skipped.most_common()))
    return "; ".join(parts)[:1000]
