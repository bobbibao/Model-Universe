---
name: high-returns
description: Playbook for a high_returns opportunity (SKUs whose 30-day return rate is above 8%, SOP-002). Use when investigating returns and proposing what to do with the item and the returned units.
---

# High returns (SOP-002)

## When
The `high_returns` detector flagged SKUs whose returned units exceed 8% of units sold in the last 30 days (at least
3 returns).

## Investigate
1. `find_high_return_skus`: returned versus sold, the return reasons and the condition of returned units.
2. `search_knowledge` for the SOP ("tỷ lệ đổi trả cao", source `SOP-002`) and cite it.
3. `search_cases` (kind `high_returns`) for earlier fixes.
4. Read the reasons: wrong size points to the size chart or description; "not as described" to photos or text;
   damaged on arrival to packaging or the carrier. Say which one the data supports.

## Propose
- `repackage`: repackage and restock the returned units in new or open-box condition, with a staff task that also
  asks to fix the listing cause (SOP-002 steps 2 and 3).
- `outlet`: when returns stay high and the item is old or open-box.
- `do_nothing`: always include it; recommend it when the returns look like noise (few units, mixed reasons).

## Measured by
The 30-day return rate, 14 days after acting; success is at least 10% lower.
