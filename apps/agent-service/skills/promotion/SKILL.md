---
name: promotion
description: Playbook for promotion levers (a per-SKU discount or a cart coupon) in growth options. Use when an option includes `discount` or `coupon`.
---

# Promotions

- `discount`: `percent` off the listed SKUs for `duration_days` (default 10% for 7 days). Code keeps only SKUs that
  are not new arrivals, not already discounted and keep the margin floor at that percent. Prefer the smallest
  percent that moves the stock; deep discounts teach customers to wait.
- `coupon`: a code (assigned by code, `AI-...`) for `percent` off orders from `min_order_vnd` (default: about the
  average order). Good for raising order value without cutting list prices.
- Never both in one option. The combined reduction can never exceed 50% of the list price (law) and the margin floor
  always holds.
- Promotions are tools for clearing stock or for an occasion, not everyday prices (brand guide).
