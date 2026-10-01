# Going live with Facebook, Meta Ads, Google Ads and TikTok Ads

Every platform runs on its fake until you switch it (`FACEBOOK_PAGE_MODE`, `META_ADS_MODE`, `GOOGLE_ADS_MODE`,
`TIKTOK_ADS_MODE`, `CONVERSIONS_MODE`, all `fake` by default). The live clients
(`apps/web-ecommerce/src/core/server/services/marketing/platforms/`) are built against the documented APIs and covered
by offline request-mapping tests (`tests/unit/platform-mapping.*.test.ts`), but no live call has been made yet (owner
decision). Go live one platform at a time, with this list.

Credentials live only in the web's environment (`apps/web-ecommerce/.env`, `infra/.env`); the agent never holds them
(`tests/architecture/test_no_platform_secrets.py`). A live mode without its credentials, or without
`SHOP_PUBLIC_URL=https://...`, stops the web at start (`assertMarketingConfig`).

## 0. Before any platform

- [ ] A lawyer has read `docs/GROWTH_AGENT.md` section 5 (Legal) once.
- [ ] The owner approved the brand guide (`brand.approved=true` on `/admin/agent/settings`); until then every growth
      capability stays in `shadow`.
- [ ] `SHOP_PUBLIC_URL` is the public https address of the shop: every ad link, post link and image URL is built on it,
      and the platforms fetch the images from it.
- [ ] The monthly ad cap on `/admin/agent/settings` is the amount you accept to spend (auto: min(10,000,000 VND, 5% of
      the trailing monthly revenue)).
- [ ] Each ad account's currency is VND and its time zone is Asia/Ho_Chi_Minh (both are fixed when the account is
      created). The clients send whole VND and Vietnam dates.
- [ ] You know the two stop buttons: `/admin/agent/campaigns` ("Tạm dừng toàn bộ quảng cáo của tác tử") and the kill
      switch (`growth.enabled` on the settings page).

## 1. Facebook Page posts (`FACEBOOK_PAGE_MODE=live`)

- [ ] Business Manager: a system user with the Page assigned; a Page access token with `pages_manage_posts`,
      `pages_read_engagement` and `pages_show_list` (`read_insights` for the post metrics).
- [ ] `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`; `META_GRAPH_API_VERSION` (default `v24.0`).
- [ ] Check the post metric names for this API version: `GET /{post-id}?fields=insights.metric(post_media_view,
      post_total_media_view_unique,post_clicks)` on a real post must answer the three metrics (`POST_METRICS` in
      `FacebookGraphPage.ts`). Meta renamed post impression metrics in 2025; adjust the list if it answers an error.
- [ ] First test: approve one post scheduled a day ahead, check it in Meta Business Suite (scheduled posts), then
      revert the action and check that it is gone.

## 2. Meta Ads (`META_ADS_MODE=live`)

- [ ] A Meta sandbox ad account first (Marketing API > Tools), then the real ad account; the system user has the
      `ads_management` permission on it and on the Page.
- [ ] `META_ACCESS_TOKEN` (system user token), `META_AD_ACCOUNT_ID` (digits, without `act_`), `FACEBOOK_PAGE_ID`.
- [ ] VND amounts: VND has no minor unit, so `daily_budget` is sent as whole VND. Create one ad and check that the ad set
      shows the same daily budget in Ads Manager (not 100x).
- [ ] Conversions: `NEXT_PUBLIC_META_PIXEL_ID` set and the Pixel receiving `Purchase` (Events Manager > Test events).
      An ad with `objective=conversions` without a pixel is refused before any call.
- [ ] The objective switch (`/marketing/ads/{ref}/optimization`) pauses the campaign and creates a replacement (a
      campaign's objective cannot change). Check once that the old campaign is paused and the new one delivers. The
      metrics sync reads the current campaign only: the switch day's spend on the old campaign is not booked again.
- [ ] First test: a 50,000 VND/day ad for 1 day on the sandbox account; activate, sync, pause, revert.

## 3. Google Ads (`GOOGLE_ADS_MODE=live`)

- [ ] A Google Ads test manager account and a developer token with at least Basic access; an OAuth client and a
      refresh token for a user with access to the customer.
- [ ] `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`,
      `GOOGLE_ADS_CUSTOMER_ID` (digits, no dashes), `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (the manager account, when used).
- [ ] The library is `google-ads-api` 25.x (API v25, gRPC; Node 22). Check that the campaign's `start_date_time` /
      `end_date_time` (`yyyy-MM-dd HH:mm:ss`, account time zone) are accepted; a start in the past is left out.
- [ ] Amounts are micros: a 200,000 VND budget is `amount_micros = 200000000000`. Check the budget shown in the UI.
- [ ] Offline conversions: a conversion action of type "Import > Clicks" and its id in
      `GOOGLE_ADS_CONVERSION_ACTION_ID`; `NEXT_PUBLIC_GOOGLE_TAG_ID` and `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` set.
      Uploads use `partial_failure=true`; a refused conversion is recorded as `failed` in `conversion_event`.
- [ ] First test on the test account: create (paused), activate, sync (GAQL), change the budget, pause, revert.

## 4. TikTok Ads (`TIKTOK_ADS_MODE=live`)

- [ ] A TikTok for Business developer app approved for the Marketing API; an advertiser account; an access token for it.
- [ ] `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`, and `TIKTOK_IDENTITY_ID`: a custom identity (name and avatar shown
      on the ad), created once in TikTok Ads Manager or with `/identity/create/`.
- [ ] A staff-uploaded video in `marketing_asset` (TikTok has no image ads); the client uploads it by URL from
      `SHOP_PUBLIC_URL` and uses its cover as the ad's image.
- [ ] Check the Business API v1.3 endpoints the client calls (`/file/video/ad/upload/`, `/file/image/ad/upload/`,
      `/campaign/create/`, `/adgroup/create/`, `/ad/create/`, `/campaign/status/update/`, `/adgroup/budget/update/`,
      `/report/integrated/get/`) against the current API reference, and that `schedule_start_time` is UTC.
- [ ] Report metrics: `spend`, `impressions`, `clicks`, `complete_payment`, `complete_payment_roas` (the value is
      spend x ROAS). Check them on a delivering ad.
- [ ] Conversions: `NEXT_PUBLIC_TIKTOK_PIXEL_ID` and `TIKTOK_EVENTS_TOKEN` (Events API) for `CONVERSIONS_MODE=live`.
- [ ] First test: a 1-day ad at the minimum daily budget; activate, sync, pause, revert.

## 5. Server-side conversions (`CONVERSIONS_MODE=live`)

- [ ] For each configured tag, its server token: `META_CAPI_TOKEN`, `TIKTOK_EVENTS_TOKEN`, and the Google Ads
      credentials plus `GOOGLE_ADS_CONVERSION_ACTION_ID`.
- [ ] Place one order with `?fbclid=...` / `?gclid=...` / `?ttclid=...` on the landing URL and marketing consent: each
      platform shows one purchase (browser and server deduplicated by `event_id` = the order id). Without consent the
      payloads carry no hashed email or phone (`conversion_event.payload`).

## 6. After going live

- [ ] Keep the platform's capability in `ask` for at least two weeks (`/admin/agent/settings`); `auto_low` needs 10
      measured outcomes (docs/GROWTH_AGENT.md section 4, autonomy ramp).
- [ ] Watch `/admin/agent/campaigns` and `/admin/agent/audit` daily for the first week.
