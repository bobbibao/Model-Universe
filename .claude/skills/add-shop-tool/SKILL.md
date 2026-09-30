---
name: add-shop-tool
description: Add a read-only tool the agents can call to look at shop data (a metric, a lookup, a summary), backed by an analytics view. Use when the agent needs to see data it cannot see today.
---

Status: stub; finished in Phase 2 when the first tools exist.

1. If the data is not in a view yet, add it to `apps/web-ecommerce/src/core/server/database/analytics/AnalyticsViews.ts`
   (no customer identity; quote `"order"` and camelCase columns).
2. Add the read to the `ShopReader` Protocol (`src/shop_agent/domain/ports.py`) and implement it in
   `adapters/shop_db.py` and `adapters/fake_shop.py`.
3. Add the `@tool` in `src/shop_agent/tools/`; resolve dependencies with `tools.deps.get_deps(runtime)`.
4. Register it in the `KindSpec` read tools that need it (`agents/kinds.py`).
5. Tests: `tests/tools/` against FakeShop; `-m db` test against the view if it is new. Gate: `uv run poe check`.
