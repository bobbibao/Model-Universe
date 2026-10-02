---
name: dead-stock
description: Playbook for a dead_stock opportunity (items 90+ days in stock selling at most 0.2 units a day, SOP-001). Use when investigating dead stock and proposing how to recover its value.
---

# Dead stock (SOP-001)

## When
The `dead_stock` detector flagged SKUs that have been in stock for 90 days or more and sell 0.2 units a day or fewer.
The opportunity lists the SKUs and the value at cost.

## Investigate
1. `find_dead_stock`: the flagged SKUs with age, velocity, cost value, price, channel and condition.
2. `search_knowledge` for the SOP ("hàng tồn kho lâu ngày", source `SOP-001`) and cite it.
3. `search_cases` (kind `dead_stock`) for what was tried before and how it turned out.
4. Look for what the items share: category, price far above similar items, age, condition. SOP-001 says a listing
   problem (missing sizes, poor photos, wrong category, price) is often the real cause.
5. Use the estimator tools to compare options before choosing parameters.

## Propose
Options, in SOP-001's order of preference, only those the data supports:
- `discount`: a time-limited percentage discount (default 20% for 14 days). Stay well inside the limits you are told.
- `bundle`: bundle with a best seller outside the opportunity.
- `outlet`: move items 180+ days old or open-box to the outlet channel.
- `donate` / `recycle`: only what cannot sell; damaged or expired units are recycled, never sold.
- `do_nothing`: always include it; recommend it when the evidence says the stock will sell or the cost outweighs
  the recovery.

## Measured by
Dead-stock value at cost, 14 days after acting; success is at least 10% lower.
