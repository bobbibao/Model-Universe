---
name: add-market-source
description: Add a market data source (competitor prices, campaigns, trends, events) that the collect graph runs. Use when the growth agent needs a new kind of market or competitor data.
---

Paths are relative to `apps/agent-service/`. Examples: `src/shop_agent/adapters/market/google_trends.py` (an API
through a blocking client) and `src/shop_agent/adapters/market/competitor_sites.py` (web pages).

1. Collector: a dataclass in `src/shop_agent/adapters/market/` that satisfies `MarketCollector`
   (`adapters/market/__init__.py`): a `source` name and `async collect(snapshot) -> MarketObservations`. It reads what
   it needs from the `GrowthSnapshot` (settings such as `market.trend_keywords`, `snapshot.watch_list()`, the
   calendar) and returns observations only; it never writes. Failures become the observations' `status`
   (`degraded`, `blocked`) and a short Vietnamese `detail` for the Market page, never an exception. Blocking clients
   run in `asyncio.to_thread`; files are read off the event loop. Inject the network client through a factory field
   so tests can replace it.
2. Rules (ADR-0014, `adapters/market/polite.py`): public data only; `is_denied(url)` before any request (marketplaces
   are never read, the denylist is code); `RobotsPolicy` before a page; `DomainRateLimiter` (10 s per domain) before
   every request, robots.txt included; a page cap per run; the identifying `USER_AGENT`; no login, no cookies kept,
   no CAPTCHA solving, no proxy rotation (`is_challenge` -> `blocked`, stop the run; 429 -> `degraded`). Keep only
   parsed fields: integer VND, titles cut to 200 characters, URLs. No personal data.
3. Contract: a new source name or field goes into `POST /market/observations` in
   `packages/contracts/openapi/web-agent-api.yaml` (its request schema), the web's
   `MarketService.recordObservations`, the `SourceName` literal in `domain/growth/market.py`, and `FakeWorld.record`
   in the same change. The idempotency key stays `collect:{source}:{date}` (one post per source per Vietnam day).
4. Wiring: add it to `wiring.market_collectors()` and, if it reaches the outside world, behind a rollout flag
   (`FF_MARKET_*` in `config.py`, checked in `wiring.enabled_market_sources`). The `collect` graph, its cron
   (`45 23 * * *` UTC) and the CLI (`shop-agent collect --source <name> [--dry-run]`) need no change except the
   CLI's `MARKET_SOURCES` choices and, if the cron should read it, `graphs/collect.py:DEFAULT_SOURCES`.
5. Detectors read the new data from the snapshot (`add-detector`); a source that goes stale must switch its
   detector off by itself (e.g. `trend_spike` only uses data under 7 days old).
6. Tests with no network (`tests/unit/market/`, fixtures in `tests/unit/market/conftest.py`): a success case, the
   status for each failure (`blocked`, `degraded`), and for page sources: robots disallow means no request, a
   denylisted URL means no request even with `watch=true`, the limiter spaces requests. Contract:
   `tests/contract/test_growth_contract.py` posts a body through the validating web double.
   Gate: `uv run poe check`, `SHOP_ADAPTER=fake uv run shop-agent collect --source <name> --dry-run` (fixture data).
