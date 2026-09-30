---
name: add-market-source
description: Add a market data source (competitor prices, campaigns, trends, events) that the collect graph runs. Use when the growth agent needs a new kind of market or competitor data.
---

Status: stub; finished in Phase 5.

1. Implement the `MarketSource` Protocol in `src/shop_agent/adapters/market/` (async; returns observations only).
2. Respect ADR-0014: public data only, robots.txt, rate limits, no CAPTCHA solving, no proxy rotation, marketplaces
   denylisted, no personal data.
3. Register it in `graphs/collect.py` behind a feature flag; observations go through `POST /market/observations`.
4. Tests with recorded fixtures and no network.
