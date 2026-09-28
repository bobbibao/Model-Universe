---
name: add-strategy
description: Add a new improvement strategy (e.g. a new way to handle dead stock or returns) to the Improve phase. Use when asked to add a way of handling excess inventory, returns, or a similar operational problem.
---

1. Create `apps/agent-service/src/ci_agent/domain/strategies/<name>.py`.
2. Subclass `ImprovementStrategy` (see `domain/strategies/base.py`). Implement:
   - `applies_to(signal)`: which `Signal.kind`s this strategy is for.
   - `preview(signal, ctx)`: deterministic `OptionPreview` with real numbers (or `None` if not
     viable). This is what the human sees in the Ask phase - never let an LLM write it.
   - `plan(signal, directive, ctx)`: turn the approved `Directive` into an `ActionPlan` of
     `PlannedAction`s. Only touch SKUs in `directive.sku_scope`.
   - `validate_params`/`derive_limits` if the strategy has human-editable parameters (see
     `discount.py` for the pattern).
3. Decorate the class with `@register_strategy` and add an import line in
   `domain/strategies/__init__.py`.
4. If the strategy needs a new `PlannedAction.type`, add a matching `ActionCommand` in
   `application/commands/shop_commands.py` and (if it's a real shop call) a method on
   `ShopActionPort` + `HttpShopActionAdapter` + `FakeShop`.
5. Add unit tests in `tests/unit/domain/` mirroring `test_strategies_and_measurement.py`:
   preview is deterministic (same input -> same output), and `plan()` respects `sku_scope`.
6. Run `python -m ci_agent.interfaces.cli simulate --auto-approve` and confirm your strategy
   shows up as an option for the right signal kind.
