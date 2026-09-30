# Growth agent

The growth agent decides by itself **when** and **what** to do to raise revenue: Facebook posts, paid ads on Meta,
Google Ads and TikTok, and promotions (discounts and coupons). It is driven by sales data, market data, the brand's
philosophy and competitor activity, and every action is bounded by layered limits, risk tiers and approvals.

It is not a separate system: it adds opportunity *kinds*, detectors, estimators, policies and playbooks to the same
`improvement` / `monitor` graphs described in `docs/ARCHITECTURE.md`. Decisions: ADR-0011 (autonomy and approvals),
ADR-0014 (compliance). Implementation phases P5 to P7 of `docs/plans/2026-09-30-agent-v2-refactor-and-growth-agent.md`.

## 1. Growth agent: decision engine

The loop is unchanged. `monitor` detects opportunities, then `improvement` runs one thread per opportunity:
investigate → validate → review → act → measure → learn.

Growth adds new *kinds*, a prioritizer, estimators, policies, brand safety, risk tiers and in-flight protective checks:

```
monitor tick (cron, deterministic)
  sync_metrics  -> web pulls ad/post insights (Agent API, ingestion class)
  guard         -> in-flight checks on live campaigns/promos -> PROTECTIVE actions (pause/end) + notify + incident thread
  sweep         -> due measurements, expired approvals
  detect        -> growth + ops detectors over GrowthSnapshot -> Opportunity[]
  prioritize    -> score = E[incremental gross profit] x confidence; capacity, cooldown, blackout, budget left
  open_threads  -> top-K new fingerprints -> improvement runs; the rest recorded as deferred
improvement thread (per opportunity)
  investigate   -> LLM planner (read-only tools + playbook skill) -> GrowthProposal (options of ActionSpecs; "do nothing" mandatory)
  validate      -> deterministic: build COMPLETE request bodies, recompute estimates, policies, brand lint + LLM judge
                   (revise <=2), risk tier per action, idempotency key per step
  review        -> autonomy: auto (every action low tier AND its capability in auto_low) | shadow (record only) | interrupt()
  act           -> baseline, then saga: send the approved bodies VERBATIM with their keys + approval grant; compensate on failure
  measure       -> attribution + incrementality vs baseline, verdict vs goal; outcome -> web + Store; priors updated
  learn         -> worker model writes the case (every outcome, incl. reject/expire/shadow)
```

**Opportunity kinds.** Detectors live in `domain/growth/detectors/`. Default thresholds live in `data/growth/defaults.yaml`
and are overridden by settings.

| Kind | Trigger (default) | Candidate levers |
|---|---|---|
| `revenue_gap` | Month-to-date revenue at least 10% behind a weekday-weighted pace of the monthly target | promo, post, ads |
| `overstock` | More than 120 days of cover, or the v1 dead-stock rule | promo, post, ads |
| `rising_demand` | SKU or category 7-day velocity at least 1.5× the 28-day velocity, and at least 21 days of cover | post, ads (no discount) |
| `competitor_undercut` | A fresh (under 72 h) competitor price at least 8% below ours on a matched SKU with sales in the last 30 days | promo within the margin floor, value content, or do nothing |
| `competitor_campaign` | A competitor campaign is active in our category | counter post or promo, or do nothing |
| `trend_spike` | Google Trends interest for a mapped keyword up at least 40% week over week, with stock available | Google Search ads, post |
| `seasonal_event` | An event in `market_events` is inside its lead window (default 14 days) and has no plan | campaign (promo + posts + ads) |
| `content_cadence` | No Facebook post in 4 days | post |
| `new_arrivals` | Products created in the last 14 days that have not been announced | post, ads (no discount, by protection rule) |
| `campaign_scaling` | A live campaign's ROAS is at or above target and it has budget headroom | budget increase (tiered) |
| `weekly_plan` | Cron, Monday 08:45 Asia/Ho_Chi_Minh | week plan: scheduled posts, event promos, ad allocation |
| `incident_review` | Opened by a protective action | learn only |
| `dead_stock`, `high_returns` | v1 parity | v1 actions |

**In-flight guard.** Deterministic, no LLM, and in the protective class. It pauses an ad in three cases:
- today's spend is above 120% of the daily budget;
- month-to-date spend has reached the cap;
- ROAS is below the floor (1.5) after spending at least 500,000 VND.

It ends a promotion when the measured incremental margin falls below the floor.

## 2. Data sources

| Source | Content | Owner / store | Agent reads via |
|---|---|---|---|
| Sales | Orders, items, returns, stock, cost (`importPrice`), daily series, attribution (UTM, click id, coupon) | Web DB | `analytics.sales_daily`, `orders_attributed`, `catalog`, existing views |
| Promotions | Discounts (including scheduled), coupons (plus min order, source, campaign ref), usage | Web DB | `analytics.promotions` |
| Marketing | Campaigns, posts, ads, daily metrics, budget ledger, outcomes, assets | Web DB; metrics synced from platforms by the web | `analytics.marketing_*`, `ad_performance_daily`, `post_performance_daily` |
| Market: competitors | Prices, campaigns | Web DB. Manual entry and CSV in the console; the scraper posts through the Agent API | `analytics.market_competitor_prices`, `market_competitor_campaigns` |
| Market: trends | Interest over time per keyword (VN) | Web DB, through the agent's `collect` graph | `analytics.market_trends` |
| Market: calendar | VN retail events (Tết, 8/3, 30/4, Mid-Autumn, 20/10, 11.11, Black Friday, 12.12…) with explicit dates per year | Web DB, seeded from `data/market/events_vn.yaml` | `analytics.market_events` |
| Brand philosophy | Prose in `data/knowledge/brand/brand_guide.md`; rules in `brand_policy.yaml` | Repo (versioned) | Prose via pgvector plus a summary of at most 500 tokens injected into growth prompts. Rules are enforced in `domain/growth/brand.py` |
| Policy and goal settings | Revenue target, margin floor, spend ratio, caps, autonomy per capability, kill switch | Web `agent_setting` (+ audit), edited in the console | `analytics.agent_settings` (non-secret keys) |
| History | Cases with outcomes; lever priors | Store `("cases", kind)`; `data/growth/priors.yaml` plus learned updates | `search_cases`, estimators |

`brand_guide.md` covers values, voice, audience, do/don't and discount philosophy. `brand_policy.yaml` covers banned terms,
competitor names, superlatives, protected categories, new-arrival protection, minimum margin and maximum discount.

**Collectors** live in `adapters/market/`. They are all async and run in a deterministic `collect` graph on a daily cron,
writing through `POST /market/observations`.

- **Google Trends** (decision Q4)
  - The owner applies for the official Trends API alpha (free). The adapter uses it as soon as credentials exist.
  - Until then it uses `pytrends` (unmaintained since 2023) via `asyncio.to_thread`: at most one run per day, at most 20
    keywords (mapped from categories in settings), results cached.
  - No paid SERP API.
  - Repeated errors mark the source `degraded`. The `trend_spike` detector only fires on trend data less than 7 days
    old, so a missing source simply turns that trigger off.
- **Competitor websites** (decision Q3), behind `FF_MARKET_SCRAPING` (default **on** for the allowlist below)
  - Only public product pages on **competitors' own storefronts** (independent sites, e.g. Haravan, Sapo or Shopify
    stores) that an admin registered with `watch=true`.
  - **Marketplaces are never scraped.** A hard-coded denylist covers `shopee.vn`, `lazada.vn`, `tiki.vn`, `sendo.vn`,
    `tiktok.com`, `facebook.com` and `zalo.me`: their terms forbid automated collection and they run anti-bot systems.
    Marketplace prices come from manual entry and the weekly CSV.
  - Uses async Playwright with per-site selectors from `data/market/selectors.yaml`.
  - Checks robots.txt, sends at most 1 request per 10 s per domain, has a daily cap and an identifying user agent, and never logs in or keeps cookies.
  - **No CAPTCHA solving and no proxy rotation.** When blocked, the source becomes `blocked` and stops.
  - Stores only parsed fields: price as an integer, title cut to 200 characters, and the URL. No personal data.
- **Fixture source** for development and CI.

**Untrusted-input rule.** These inputs are data, never instructions: scraped text, competitor copy, trend queries,
customer text.
- They are delimited in prompts.
- They are read only by agents with no write tools.
- Every write still goes through validate, tiering and approval.

## 3. Tool integrations
All external calls live in the web app. The agent never holds a platform token.

Web implementation lives in `src/core/server/services/marketing/platforms/`:

| Integration | Web implementation | Operations |
|---|---|---|
| Facebook Page posts | `FacebookPageClient` (Graph API via axios, pinned `META_GRAPH_API_VERSION`) | `POST /{page-id}/feed` or `/{page-id}/photos` (catalog image); scheduled publishing; `DELETE /{post-id}` (revert); insights |
| Meta Ads (FB + IG) | `MetaAdsClient` (`facebook-nodejs-business-sdk` 24.x) | Campaign (`OUTCOME_TRAFFIC`, `PAUSED`) → AdSet (VND budget, VN geo, `LINK_CLICKS`) → AdCreative (`object_story_spec`, UTM link) → Ad; activate, pause, change budget, insights |
| Google Ads | `GoogleAdsClient` (`google-ads-api` 25.x, gRPC; Node ≥22) | Budget (`amount_micros` = VND × 1e6) → Search campaign (`PAUSED`, Maximize Clicks) → ad group → keywords → RSA (headlines ≤30 characters ×3–15, descriptions ≤90 ×2–4); activate, pause, GAQL metrics |
| TikTok Ads | `TikTokAdsClient` (Business API v1.3 via axios) | Campaign (`TRAFFIC`) → ad group → ad. **Requires a staff-uploaded video in `marketing_asset`**; without one, TikTok is excluded from allocation |
| Promotions | `AgentActionService` handlers (writes); `ProductDiscountService` and `CouponService` (pricing and checkout) | Scheduled per-SKU and per-category discounts, agent coupons (min order, usage limit), end early |
| Fakes | `FakeAdPlatform`, `FakeFacebookPage` | Same interface. Rows get `external_id = fake-…`. Metrics are simulated deterministically from spend. **This is the default mode on every platform** |

- **Mode switches:** `FACEBOOK_PAGE_MODE`, `META_ADS_MODE`, `GOOGLE_ADS_MODE` and `TIKTOK_ADS_MODE` each take `fake` or
  `live`. All default to `fake`. `live` without credentials fails at startup.
- **Live testing is deferred** (owner decision). Until then:
  - Meta, TikTok and Facebook get offline request-mapping tests with nock.
  - Google gets `jest.mock` of the library's service methods, because nock cannot intercept gRPC.
  - `docs/MARKETING_LIVE_CHECKLIST.md` records the steps for going live later.

## 4. Guardrails
Limits are layered: agent policy, then web enforcement, then platform caps.

| Guardrail | Agent (`domain/`) | Web (authoritative) | Platform |
|---|---|---|---|
| Budget caps (defaults: 10,000,000 VND per month, 3,000,000 per campaign, 500,000 per day) | `domain/growth/policies.py` in validate, and again in the write tool | `marketing_budget_period` + ledger; reserved with `SELECT … FOR UPDATE` when an ad is created; released on end or revert | Meta `spend_cap` or lifetime budget; Google budget + end date; TikTok lifetime budget |
| Discounts (see below) | Policies and estimators | `/pricing/discounts` hard checks (409 on overlap, 422 below the floor) | – |
| Frequency (posts at most 2 per day and at least 4 h apart; one promo per SKU per 30 days) | Prioritizer and policies | Endpoint checks | – |
| Brand safety | Deterministic lint plus LLM judge (see below) | Link-domain and length checks | Platform review |
| Approval thresholds (risk tiers) | `domain/growth/tiers.py`: `protective` / `low` / `medium` / `high` / `blocked` | A `shop_change` write needs a valid **approval grant**, or the capability in `auto_low` with the request inside the web's low-tier caps | – |
| Kill switch | `monitor` opens no growth threads | `growth.enabled=false` → 403 `agent_disabled` on every non-protective write; a "Pause all agent ads" button | – |
| Audit | Checkpoint history per thread; structlog JSON | `agent_action` plus new columns (Phase 6); `agent_setting_audit` | – |

**Discount rules** (decision Q6):

Decree 81/2018/ND-CP, as amended by Decree 128/2024/ND-CP (in force since 1 Dec 2024), sets two things this plan relies on:
- A price reduction may not exceed 50% of the price immediately before the promotion.
- Price reductions and purchase vouchers no longer need notification to the Department of Industry and Trade.
  Game-of-chance promotions, and loyalty programmes worth 100 million VND or more, still need registration or
  notification.

Rules derived from that:
- **Legal maximum: 50% of the pre-promotion (list) price, *combined*.**
  - Stacking counts: a product discount `d` plus an agent coupon `c` must satisfy `1 − (1−d)(1−c) ≤ 0.5`.
  - This is checked when the agent creates either one, using the maximum active discount in the coupon's scope.
  - Checkout also clamps each line's effective discount to 50% for agent-created coupons, as defence in depth.
  - The state "concentrated promotion programme" exception (up to 100%) is never used by the agent.
- **The agent only uses price reductions and vouchers.** Games of chance, lucky draws and loyalty programmes are
  outside its action set, so it never triggers a notification duty. A contract test asserts that no `ActionSpec` of
  those kinds exists.
- Margin floor: gross margin after all discounts is at least 15% over `importPrice`.
  - Exception: dead stock older than 180 days may go down to cost (0%) as a `high`-tier action.
  - Selling below cost is always `blocked`.
- No overlapping discounts on a SKU.
- New-arrival protection for 30 days.
- At most 3 concurrent promotions.
- This is not legal advice. Have a lawyer read `docs/GROWTH_AGENT.md` §Legal once before go-live, which is a runbook
  step.

**Brand-safety lint** (deterministic) checks:
- banned terms;
- competitor names (VN advertising law);
- unproven superlatives;
- **claim consistency**: every % and ₫ figure in the copy equals a value in the action bodies;
- link domain and UTM;
- per-platform lengths;
- hashtag and emoji limits;
- language.

**Brand judge** (LLM, rubric): passes when every criterion scores at least 3 and the mean is at least 4. It may revise
up to twice; after that the proposal is marked `needs_human`.

**Capabilities.** Every write maps to exactly one capability:

| Capability | Actions |
|---|---|
| `promotion` | discounts, coupons |
| `facebook_post` | posts |
| `ads_meta`, `ads_google`, `ads_tiktok` | ads on that platform |
| `inventory` | adjust_inventory, switch_channel |
| `ops_tasks` | create_task, update_sop_checklist |

**Low tier (auto-eligible) by default:**
- `facebook_post`: an organic post with no price claim.
- `promotion`: at most 15% on at most 20 SKUs for at most 7 days, above the margin floor.
- Ads: at most 300,000 VND per day and 1,500,000 VND in total, for at most 5 days, on a platform that already has at least
  one measured campaign.
- `ops_tasks`: a staff task or SOP checklist item.
- `inventory`: a channel switch or status change on at most 20 SKUs.

**Always `high`:** a platform's first campaign, category-wide promotions, and anything above the soft caps.

**Approving a `high`-tier action** (decision Q8). A mandatory second approver would deadlock a shop with one admin, so
it is not the default. Instead, approval requires:
- step-up re-authentication: a password re-entered in the last 5 minutes, checked by the web gateway before it mints
  the grant;
- the approver typing the exact total VND amount shown;
- an email to every admin after approval.

The setting `approvals.high.two_person` (default `false`) requires a second, different admin. The settings page
suggests turning it on once the shop has at least 2 admins.

**Brand gate** (decision Q5). Growth capabilities cannot leave `shadow` until the owner has reviewed
`brand_guide.md` and set `brand.approved=true` in settings. The agent never publishes copy against an unreviewed brand.

**Write classes:**
- `shop_change`: needs a grant or the auto rule.
- `protective`: pause, end, delete a post, lower a budget, revert of a `shop_change`, autonomy demotion.
- `ingestion`: market observations, metrics sync, outcomes, notifications.

### Approval grant (the key money-safety mechanism)

Invariants:
- An `ActionSpec` carries `endpoint`, `body` and `idempotency_key`.
- `validate` builds **complete** bodies before review. Every ref, code and date is already filled in.
- `act` sends those bodies verbatim.
- Time fields are relative or clamped: `duration_days`, plus an optional `starts_at`, where a past or absent value means "now".
  A late approval therefore never changes a body.
- `dry_run` is never part of a grant.

Minting (web gateway):
1. When an admin approves or edits in the console, the gateway reads the pending interrupt from thread state. For copilot
   HITL decisions it reads the pending `AIMessage.tool_calls`, which carry the ids.
2. It applies the edits. Only fields declared in `editable_fields` may change.
3. It signs a JWT with the **web-only** `AGENT_APPROVAL_SECRET`. Claims:
   - `typ=approval`, `jti`, `sub=approver`, `thread_id`;
   - `option_id` (proposal review) or `tool_call_ids` (copilot HITL);
   - `actions=[{action_id, endpoint, idempotency_key, body_hash}]`;
   - `exp` = 24 h.

`body_hash` is computed with the web's existing `hashAgentRequest(endpoint, body)`.

**The agent forwards it** as `X-Agent-Approval`.

**The web verifies it in this order:**
1. **Idempotency replay first.** The same key with the same hash returns the stored response.
2. **Grant check for a new key.** The web checks:
   - the signature and `exp`;
   - that `actions[action_id]` exists;
   - that its `endpoint` matches;
   - that `idempotency_key == Idempotency-Key`;
   - that `body_hash == hashAgentRequest(endpoint, body)`.
3. **Record** the `grantJti` and `actionId` on the `agent_action` row.

A grant is therefore **single-use per action and cannot be replayed** under a new key. A prompt-injected or buggy agent
cannot forge one.

Canonicalization is pinned by hash test vectors in `packages/contracts/test-vectors/hash/*.json`, which web Jest and Python
both assert. In-process runs (simulate, graph tests) use `shop_agent.testing.grants` with a test secret, and `FakeShop`
verifies grants the same way.

### Idempotency key schemes

| Writer | Key |
|---|---|
| Loop act step | `{thread_id}:{option_id}:{n}` |
| Copilot tool | `{thread_id}:{tool_call_id}` |
| Guard action | `guard:{ref}:{yyyymmddHH}` |
| Collector | `collect:{source}:{date}` |
| Metrics sync | `sync:{yyyymmddHH}` |
| Revert | `{key}:revert` |

### Autonomy ramp (owner choice)

**Modes per capability:** `off` → `shadow` → `ask` → `auto_low`. In `shadow`, the agent plans and records but never acts.

**Promotion to `auto_low`** is allowed by the web only when the capability has:
- at least 10 measured outcomes in the last 90 days;
- at least 60% of them non-negative;
- zero incidents in the last 30 days.

The owner can force it with a written, audited reason.

**Automatic demotion to `ask`** happens after 2 consecutive negative verdicts or any incident. This is a protective write.

**Go-live:** every capability starts in `shadow` for 2 weeks, then moves to `ask`.

## 5. Legal

Not legal advice: a lawyer reviews this section once before the first live promotion or ad (a `docs/RUNBOOK.md` step).

- **Promotion cap.** Decree 81/2018/ND-CP as amended by Decree 128/2024/ND-CP (in force since 1 Dec 2024): a price
  reduction may not exceed 50% of the price immediately before the promotion. The cap applies to the combined
  discount of a product discount and an agent coupon: `1 - (1-d)(1-c) <= 0.5`. The state "concentrated promotion
  programme" exception is never used.
- **No notification duty.** Since 1 Dec 2024, price reductions and purchase vouchers need no notification to the
  Department of Industry and Trade. The agent uses only those two forms; games of chance and loyalty programmes (which
  still need registration or notification) are outside its action set.
- **Advertising copy.** No competitor names and no unproven superlatives (Vietnamese advertising law); every price or
  percentage in copy must equal the executed action.
- **Market data.** Only competitors' own storefront sites, public pages, robots.txt respected; marketplaces are
  denylisted; no personal data is collected.
- **Personal data.** Tracking tags load only after marketing consent (Decree 13/2023/ND-CP and the Personal Data
  Protection Law); server-side events carry hashed identifiers only with consent.

## 6. Measuring outcomes against the revenue goal

**Attribution (first-party):**
- The `AttributionCapture` client component stores `utm_*` and `fbclid`/`gclid`/`ttclid` in a 30-day cookie, using last
  non-direct click.
- `OrderService.placeOrder` saves them on `"order"`.
- Agent coupons tie orders to a campaign.
- Links always carry `utm_campaign=<campaign_ref>`, set on the server.

**Incrementality** (`domain/growth/measurement.py`, deterministic):
- Difference-in-differences against at least 3 matched control SKUs: same category and price band, not promoted.
- Without enough controls: the same-weekday mean from the pre-period, multiplied by the trend.
- **Outputs:**
  - incremental revenue and gross profit, net of discount cost and ad spend;
  - ROAS/MER and CPA;
  - confidence;
  - a verdict: `positive`, `negative` or `inconclusive`.

**Measurement windows:**

| Action | Window |
|---|---|
| Post | 72 h and 7 days |
| Promotion | During the promo, plus 7 days after |
| Ads | Daily during the flight, then a final read 7 days after the end |

**Conversion tracking** (decision Q7). Tracking ships with the ad integrations in Phase 6, not later. Ads that can
only optimise for clicks waste budget.

Browser tags, loaded **only after cookie consent**:
- Meta Pixel;
- Google tag with a Google Ads conversion;
- TikTok Pixel.

The consent requirement follows Vietnam's personal-data rules: Decree 13/2023/ND-CP, and the Personal Data Protection
Law in force from 2026.

Server-side events:
- Meta Conversions API and TikTok Events API send `Purchase`, with an `event_id` shared with the browser event for
  deduplication.
- Google Ads receives an offline conversion upload keyed by `gclid`.
- Payloads contain only value, currency (VND), content ids and click ids. Hashed email or phone is added only when the
  customer consented.

Bidding follows a deterministic rule in `domain/growth/policies.py`:

| Platform | Starts on | Switches to | When |
|---|---|---|---|
| Meta | Traffic (`LINK_CLICKS`) | Sales (`OFFSITE_CONVERSIONS`, purchase) | The pixel recorded at least 50 purchases in 7 days (Meta's learning-phase threshold) |
| Google | Maximize Clicks | Maximize Conversions | At least 30 conversions in 30 days (Google's guidance) |
| TikTok | Traffic | Conversions | The same rule as Meta |

Each switch is a `medium`-tier action.

**Goal:** `agent_setting.growth.goal` holds the monthly revenue target, minimum gross margin %, and maximum marketing spend
as % of revenue.

Defaults (decision Q5; all editable in settings):

| Setting | Default |
|---|---|
| Revenue target | **auto** = 110% of the trailing 3-month average monthly revenue. With 12 months of history: 110% of the same month last year. With no history: owner-entered |
| Monthly ad cap | min(10,000,000 VND, 5% of the trailing monthly revenue). Small retailers commonly spend about 5–10% of revenue on marketing, and the ramp starts at the low end |
| Per campaign | 3,000,000 VND |
| Per day | 500,000 VND |
| Marketing spend ratio | at most 8% |
| Margin floor | 15% |

The scorecard at `/admin/agent/growth` shows:
- month-to-date revenue against pace;
- revenue attributed to the agent;
- incremental profit;
- spend;
- ROAS by platform.

The same figures appear in the weekly plan and the daily briefing.

**Feedback:**
- Outcomes are written to web `marketing_outcome`, for dashboards and the ramp gate.
- They are also written as Store cases.
- Priors update by `posterior = (n0·prior + n·observed)/(n0+n)`.
