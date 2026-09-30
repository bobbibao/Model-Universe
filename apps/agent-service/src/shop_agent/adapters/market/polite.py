"""Rules every page request to an outside site follows (plan decision Q3).

- Marketplaces are never requested: their terms forbid automated collection. The denylist is code, not settings.
- robots.txt is read first (cached per origin); a disallowed page is not requested.
- At most one request per `MIN_INTERVAL_S` per domain, and at most `DAILY_PAGE_CAP` pages per run (one run a day).
- An identifying user agent; no login, no cookies kept between runs, no CAPTCHA solving, no proxy rotation.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

USER_AGENT = "ShopAgentMarketBot/1.0 (price monitoring of public product pages; respects robots.txt)"
ROBOTS_AGENT = "ShopAgentMarketBot"
MIN_INTERVAL_S = 10.0
DAILY_PAGE_CAP = 100

MARKETPLACE_DENYLIST = frozenset(
    {"shopee.vn", "lazada.vn", "tiki.vn", "sendo.vn", "tiktok.com", "facebook.com", "zalo.me"}
)

# Signs that a page is a bot challenge rather than the product page (lower-case substrings of the HTML).
CHALLENGE_MARKERS = (
    "g-recaptcha",
    "h-captcha",
    "hcaptcha.com",
    "cf-challenge",
    "challenges.cloudflare.com",
    "captcha-delivery.com",
    "verify you are human",
    "xác minh bạn là người",
)


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower().rstrip(".")


def is_http_url(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme in ("http", "https") and bool(parts.hostname)


def is_denied(url: str) -> bool:
    """A marketplace (or a subdomain of one): never requested, even when an admin marked it `watch`."""
    host = host_of(url)
    return any(host == domain or host.endswith(f".{domain}") for domain in MARKETPLACE_DENYLIST)


def is_challenge(status: int, html: str) -> bool:
    """A CAPTCHA or bot-check page: the source stops and reports `blocked`."""
    text = html.lower()
    return any(marker in text for marker in CHALLENGE_MARKERS) or (status in (401, 403) and "captcha" in text)


@dataclass
class DomainRateLimiter:
    """Spaces requests to one domain at least `interval_s` apart (the clock and sleep are injectable for tests)."""

    interval_s: float = MIN_INTERVAL_S
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep
    _last: dict[str, float] = field(default_factory=dict)

    async def wait(self, domain: str) -> None:
        last = self._last.get(domain)
        if last is not None:
            delay = last + self.interval_s - self.clock()
            if delay > 0:
                await self.sleep(delay)
        self._last[domain] = self.clock()


RobotsFetch = Callable[[str], Awaitable[tuple[int, str]]]


@dataclass
class RobotsPolicy:
    """robots.txt per origin, read once per run. `fetch(robots_url)` returns (status, body).

    As in `urllib.robotparser`: 401/403 disallow the whole site, other 4xx allow it; a network error or a 5xx
    disallows it (we cannot tell what the site allows, so we do not ask).
    """

    fetch: RobotsFetch
    agent: str = ROBOTS_AGENT
    _parsers: dict[str, RobotFileParser] = field(default_factory=dict)

    async def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        parser = self._parsers.get(origin)
        if parser is None:
            parser = RobotFileParser(f"{origin}/robots.txt")
            try:
                status, body = await self.fetch(f"{origin}/robots.txt")
            except Exception:  # any failure to read robots.txt means "do not crawl"
                status, body = 503, ""
            if status in (401, 403) or status >= 500:
                parser.parse(["User-agent: *", "Disallow: /"])
            elif status >= 400:
                parser.parse([])  # no robots.txt: everything is allowed
            else:
                parser.parse(body.splitlines())
            self._parsers[origin] = parser
        return parser.can_fetch(self.agent, url)
