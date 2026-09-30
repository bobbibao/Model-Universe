"""The rules every outside request follows: denylist, robots.txt, per-domain rate limit, challenge detection."""

from __future__ import annotations

import pytest

from shop_agent.adapters.market.polite import (
    DomainRateLimiter,
    RobotsPolicy,
    host_of,
    is_challenge,
    is_denied,
    is_http_url,
)
from tests.unit.market.conftest import CAPTCHA_HTML, PRODUCT_HTML, FakeClock


@pytest.mark.parametrize(
    "url",
    [
        "https://shopee.vn/product/1",
        "https://www.lazada.vn/products/x.html",
        "https://tiki.vn/p/1",
        "https://m.sendo.vn/x",
        "https://shop.tiktok.com/view/product/1",
        "https://www.facebook.com/marketplace/item/1",
        "https://zalo.me/x",
        "https://SHOPEE.VN./x",
    ],
)
def test_marketplaces_are_denied(url: str) -> None:
    assert is_denied(url)


@pytest.mark.parametrize(
    "url", ["https://an-nhien.example/products/a", "https://notshopee.vn/x", "https://tiki.vn.example/x"]
)
def test_own_storefronts_are_not_denied(url: str) -> None:
    assert not is_denied(url)


def test_url_helpers() -> None:
    assert host_of("https://WWW.Example.com:8443/a") == "www.example.com"
    assert is_http_url("http://a.example/x") and not is_http_url("ftp://a.example/x") and not is_http_url("/x")


def test_challenge_pages_are_recognised() -> None:
    assert is_challenge(200, CAPTCHA_HTML)
    assert is_challenge(403, "<html>Please complete the CAPTCHA</html>")
    assert is_challenge(200, "<p>Xác minh bạn là người</p>")
    assert not is_challenge(200, PRODUCT_HTML)
    assert not is_challenge(403, "<html>Forbidden</html>")


async def test_rate_limiter_spaces_requests_per_domain(clock: FakeClock, limiter: DomainRateLimiter) -> None:
    await limiter.wait("a.example")
    await limiter.wait("b.example")  # another domain: no wait
    assert clock.sleeps == []
    clock.now += 4
    await limiter.wait("a.example")
    assert clock.sleeps == [pytest.approx(6)]
    await limiter.wait("a.example")
    assert clock.sleeps == [pytest.approx(6), pytest.approx(10)]


async def test_robots_rules_are_followed_and_read_once_per_origin() -> None:
    reads: list[str] = []

    async def fetch(url: str) -> tuple[int, str]:
        reads.append(url)
        return 200, "User-agent: *\nDisallow: /checkout\n\nUser-agent: ShopAgentMarketBot\nDisallow: /private\n"

    robots = RobotsPolicy(fetch)
    assert await robots.allowed("https://a.example/products/1")
    assert not await robots.allowed("https://a.example/private/list")
    assert await robots.allowed("https://a.example/checkout")  # our own group applies, not `*`
    assert reads == ["https://a.example/robots.txt"]


@pytest.mark.parametrize(
    ("answer", "allowed"),
    [((404, ""), True), ((410, ""), True), ((401, ""), False), ((403, ""), False), ((503, ""), False)],
)
async def test_robots_status_codes(answer: tuple[int, str], allowed: bool) -> None:
    async def fetch(url: str) -> tuple[int, str]:
        return answer

    assert await RobotsPolicy(fetch).allowed("https://a.example/products/1") is allowed


async def test_unreadable_robots_means_do_not_crawl() -> None:
    async def fetch(url: str) -> tuple[int, str]:
        raise OSError("connection refused")

    assert not await RobotsPolicy(fetch).allowed("https://a.example/products/1")
