# ADR-0014: Compliance rules for promotions, market data and tracking

**Status:** accepted on 2026-09-30 (decisions Q3, Q6, Q7, Q8 of the v2 plan). Not legal advice: a lawyer reviews
`docs/GROWTH_AGENT.md` (Legal) once before the first live promotion or ad.

**Decision:**

- **Promotions** (Decree 81/2018/ND-CP as amended by Decree 128/2024/ND-CP, in force since 1 Dec 2024): a price
  reduction may not exceed 50% of the price immediately before the promotion. The cap applies to the *combined*
  discount: a product discount `d` and an agent coupon `c` must satisfy `1 - (1-d)(1-c) <= 0.5`, checked when either is
  created and clamped at checkout for agent coupons. The agent uses only price reductions and vouchers, which need no
  notification to the Department of Industry and Trade; games of chance and loyalty programmes are outside its action
  set. Selling below cost is blocked.
- **Market data:** competitors' own storefront sites only (public product pages, robots.txt respected, rate-limited, no
  login, no CAPTCHA solving, no proxy rotation, no personal data). Marketplaces (`shopee.vn`, `lazada.vn`, `tiki.vn`,
  `sendo.vn`, `tiktok.com`, `facebook.com`, `zalo.me`) are hard-denylisted: their prices come from manual entry and CSV.
- **Tracking:** Meta Pixel, Google tag and TikTok Pixel load only after marketing consent (Decree 13/2023/ND-CP and the
  Personal Data Protection Law); server-side events send value, currency, content ids and click ids, and hashed
  identifiers only with consent; browser and server events are deduplicated by `event_id`.
- **Large spend:** high-tier approvals need step-up re-authentication and the typed VND total; a second approver
  (`approvals.high.two_person`) is optional.
