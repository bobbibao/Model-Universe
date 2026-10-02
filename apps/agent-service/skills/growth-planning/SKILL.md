---
name: growth-planning
description: Base playbook for every growth opportunity (revenue gap, overstock, demand, competitors, trends, events, content, ads). Use when planning options that raise revenue with promotions, Facebook posts and paid ads.
---

# Growth planning

## How growth options work
- Each menu strategy is a set of levers run as one campaign: `discount`, `coupon`, `post`, `ads`, joined by `+`
  (for example `discount+post`). Code builds the campaign, refs, links, coupon code and every request body from the
  strategy and your parameters, and recomputes the estimate. Leave a parameter out to take the menu's default.
- The menu shows each strategy's estimate: incremental revenue and gross profit as p10 / p50 / p90, spend, discount
  cost and confidence. Prefer the option with the best p50 profit that the evidence supports; a negative p50 profit
  is a reason to recommend something else or `do_nothing`.
- Stay inside the limits you are told: margin floor, ad budget left, per-day and per-campaign caps. Options inside the
  `low_risk` limits can run without asking the owner when the owner allows it; anything above waits for approval.

## Investigate
1. `get_goal_pacing` and `get_sales_summary`: where the month stands against the goal.
2. `get_active_promotions` and `get_policy_limits`: what already runs, and what is allowed.
3. The kind's own reads (SKU performance, competitors, trends, events, campaigns).
4. `search_cases` for this kind: what worked before and what was rejected.

## Propose
- At most three options plus `do_nothing`; always include `do_nothing`.
- Write the copy yourself (post `message`, ad texts) in the brand voice, quoting only the numbers of your option
  (its percent, minimum order, prices). Check each text with `check_copy` before you return it.
- Never discount new arrivals, never go below the margin floor, never stack a discount and a coupon.
