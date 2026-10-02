---
name: ad-campaign
description: Playbook for paid ads (Meta, Google Search, TikTok), budget scaling and the bidding switch in growth options. Use when an option includes `ads`, or for campaign_scaling and bidding_upgrade.
---

# Paid ads

- `ads`: one ad on `platform` with `daily_budget_vnd` for `duration_days`, created paused and then activated. Default
  platform: the best expected ROAS; Google Search for a trend spike (people are searching). TikTok only with a staff
  video (`list_marketing_assets`).
- Copy per platform: Meta `headline` (<= 40 characters) and `primary_text`; Google 3-15 `headlines` (<= 30) and 2-4
  `descriptions` (<= 90) plus `keywords`; TikTok `ad_text` (<= 100).
- At typical margins an ad pays only with ROAS around 3 or more: check the estimate's p50 profit. A platform's first
  campaign always needs the owner.
- `scale_budget` (campaign_scaling): raise a well-performing ad's daily budget (default x1.5, never above the per-day
  cap). `switch_bidding` (bidding_upgrade): optimise a traffic ad for purchases once the platform has enough
  purchase data.
- Live ads are watched every tick: overspend, the monthly cap or ROAS under 1.5 after 500,000 VND pause them
  automatically.
