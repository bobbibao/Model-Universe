---
name: add-shop-tool
description: Add a read-only tool the agents can call to look at shop data (a metric, a lookup, a summary), backed by an analytics view. Use when the agent needs to see data it cannot see today.
---

Paths are relative to `apps/agent-service/`. Examples: `src/shop_agent/tools/metrics.py`.

1. If the data is not in a view yet, add it to `apps/web-ecommerce/src/core/server/database/analytics/AnalyticsViews.ts`
   (no customer identity; quote `"order"` and camelCase columns).
2. Add the read to the `ShopReader` Protocol (`src/shop_agent/domain/ports.py`) and implement it in
   `adapters/shop_db.py` (SQL constant + pure row mapping to domain types, money as whole VND `int`) and
   `adapters/fake_shop.py`. Every value a person sees is computed in `domain/`, never in the tool.
3. Add the tool as an `async` `@tool` in `src/shop_agent/tools/<module>.py`:
   - signature `async def name(<args>, runtime: ShopToolRuntime) -> str`, with a one-line docstring the model reads;
   - `deps = await get_deps(runtime)`; read with `deps.reader`, time from `deps.clock()`;
   - return compact text (cap rows, e.g. `MAX_ROWS`), money through `domain.money.format_vnd`;
   - add it to the module's tool list (e.g. `METRIC_TOOLS`).
   A write tool goes in `tools/writes.py` through `_write(...)` and a `WRITES` entry (its action type and path
   parameter): it builds the exact request with the key `{thread_id}:{tool_call_id}`, checks the limits and the shop's
   rules before sending, and forwards the grant the gateway put in the thread's state. Add its case to
   `packages/contracts/test-vectors/copilot/write-tools.json` and `COPILOT_TOOLS` in the web's `CopilotToolUtils.ts`;
   `agents/approval.py` gates it unless it is protective.
4. Register it in the `KindSpec` read tools that need it (`agents/kinds.py`, from Phase 3).
5. Tests: `tests/tools/` through `tests.support.tools.call_tool` (a real ToolNode, FakeShop as the run context);
   a `-m db` test in `tests/integration/` if the view is new. Gate: `uv run poe check`.
