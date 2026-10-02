import { Sequelize } from 'sequelize-typescript';
import Logger from '../../../../shared/server/utils/logger';
import { AGENT_SETTING_KEYS } from '../../services/AgentSettingDefinitions';
import { failIfStrict } from '../client/seeders/Seeder';

// Read-only views for the shop agent (docs/adr/0002). The agent reads ONLY these, through the `ci_reader` role
// (infra/sql/ci_reader.sql), never the tables themselves. They are the contract between this app's schema and the
// agent's `shop_db` adapter: change a view and that adapter together. No customer data (user ids, names, addresses,
// free text) appears in any view. Amounts are whole VND.
//
// Views hold no data, so they are dropped and recreated on every start, after the migrations: the definitions here
// are always the live ones. The `ci_reader` default privileges re-grant SELECT on the new views. Days and months are
// calendar days in Vietnam (Asia/Ho_Chi_Minh).

const SCHEMA = 'analytics';
const TZ = `'Asia/Ho_Chi_Minh'`;
const SETTING_KEYS = AGENT_SETTING_KEYS.map((key) => `'${key}'`).join(', ');

// Growth targets when the owner leaves them on `auto` (docs/GROWTH_AGENT.md section 6, decision Q5).
const AUTO_TARGET_UPLIFT = 1.1; // 110% of the reference revenue
const AUTO_AD_CAP_SHARE = 0.05; // 5% of the trailing monthly revenue ...
const AUTO_AD_CAP_MAX_VND = 10_000_000; // ... and at most 10,000,000 VND a month

// Name -> SELECT, created in this order: a view may read the views above it.
const VIEWS: Record<string, string> = {
  // Sellable products only (not discontinued, not held back): what the agent may act on. `stocked_at` is the
  // latest stock arrival, else the product's creation: the start of "days in stock".
  stock_on_hand: `
    SELECT p.sku, p.name, c.name AS category, p.stock AS quantity,
           p."importPrice" AS unit_cost_vnd, p.price AS unit_price_vnd, p."salesChannel"::text AS sales_channel,
           COALESCE(li.last_import_at, p."createdAt") AS stocked_at
    FROM product p
    JOIN category c ON c.id = p."categoryId"
    LEFT JOIN (
      SELECT sii."productId", MAX(si."createdAt") AS last_import_at
      FROM stock_import_item sii
      JOIN stock_import si ON si.id = sii."stockImportId"
      GROUP BY sii."productId"
    ) li ON li."productId" = p.id
    WHERE NOT p."isArchived" AND p."inventoryStatus" = 'available'`,

  // Units sold per SKU over the last 30 days (orders not cancelled), for every product whatever its status.
  units_sold_30d: `
    SELECT p.sku, SUM(oi.quantity)::int AS units
    FROM order_item oi
    JOIN "order" o ON o.id = oi."orderId"
    JOIN product p ON p.id = oi."productId"
    WHERE o.status <> 'CANCELLED' AND o."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY p.sku`,

  // Received returns (goods back, condition known), one row per returned line, for every product.
  returns: `
    SELECT rr."orderId" AS order_id, p.sku, ri.reason::text AS reason, ri.condition::text AS condition,
           ri.quantity, ri."refundAmount" AS refund_vnd, rr."receivedAt" AS returned_at
    FROM return_item ri
    JOIN return_request rr ON rr.id = ri."returnRequestId"
    JOIN order_item oi ON oi.id = ri."orderItemId"
    JOIN product p ON p.id = oi."productId"
    WHERE rr.status = 'RECEIVED'`,

  // Sales made while an agent discount was running on the product (the "recovered value" KPI).
  clearance_sales: `
    SELECT p.sku, o."createdAt" AS sold_at, oi."unitPrice" * oi.quantity AS revenue_vnd
    FROM order_item oi
    JOIN "order" o ON o.id = oi."orderId"
    JOIN product p ON p.id = oi."productId"
    WHERE o.status <> 'CANCELLED'
      AND EXISTS (
        SELECT 1 FROM product_discount d
        WHERE d."productId" = oi."productId"
          AND d."startsAt" <= o."createdAt"
          AND o."createdAt" < LEAST(d."endsAt", d."revokedAt")
      )`,

  // Every product, sellable or not, with its effective price now (the highest running discount, as the storefront).
  catalog: `
    SELECT p.sku, p.name, p."brandName" AS brand, p.description, c.slug AS category, c.name AS category_name,
           p.gender::text AS gender, p.price AS price_vnd, p."importPrice" AS unit_cost_vnd,
           COALESCE(ROUND(p.price * (100 - d.percent)::numeric / 100)::int, p.price) AS sale_price_vnd,
           COALESCE(d.percent, 0) AS discount_pct, p.stock AS quantity, p."inventoryStatus"::text AS inventory_status,
           p."salesChannel"::text AS sales_channel, p."isArchived" AS is_archived, p."createdAt" AS created_at,
           (SELECT MAX(si."createdAt") FROM stock_import_item sii
              JOIN stock_import si ON si.id = sii."stockImportId"
             WHERE sii."productId" = p.id) AS last_received_at
    FROM product p
    JOIN category c ON c.id = p."categoryId"
    LEFT JOIN (
      SELECT "productId", MAX(percent) AS percent
      FROM product_discount
      WHERE "revokedAt" IS NULL AND "startsAt" <= NOW() AND "endsAt" > NOW()
      GROUP BY "productId"
    ) d ON d."productId" = p.id`,

  // One row per day with orders (cancelled orders excluded). Gross profit is at today's unit cost, net of coupons.
  sales_daily: `
    WITH orders AS (
      SELECT o.id, (o."createdAt" AT TIME ZONE ${TZ})::date AS day, o.total, o.discount,
             (o."utmSource" IS NOT NULL OR o."clickId" IS NOT NULL OR cp.source = 'agent') AS attributed
      FROM "order" o
      LEFT JOIN coupon cp ON cp.code = o."couponCode"
      WHERE o.status <> 'CANCELLED'
    ), items AS (
      SELECT oi."orderId" AS order_id, SUM(oi.quantity) AS units,
             SUM((oi."unitPrice" - p."importPrice") * oi.quantity) AS margin
      FROM order_item oi
      JOIN product p ON p.id = oi."productId"
      GROUP BY oi."orderId"
    )
    SELECT o.day, COUNT(*)::int AS orders, COALESCE(SUM(i.units), 0)::int AS units,
           SUM(o.total)::bigint AS revenue_vnd, SUM(o.discount)::bigint AS coupon_discount_vnd,
           SUM(COALESCE(i.margin, 0) - o.discount)::bigint AS gross_profit_vnd,
           COUNT(*) FILTER (WHERE o.attributed)::int AS attributed_orders
    FROM orders o
    LEFT JOIN items i ON i.order_id = o.id
    GROUP BY o.day`,

  // Units and revenue per SKU per day (cancelled orders excluded): velocity and SKU performance.
  sku_sales_daily: `
    SELECT (o."createdAt" AT TIME ZONE ${TZ})::date AS day, p.sku, SUM(oi.quantity)::int AS units,
           SUM(oi."unitPrice" * oi.quantity)::bigint AS revenue_vnd
    FROM order_item oi
    JOIN "order" o ON o.id = oi."orderId"
    JOIN product p ON p.id = oi."productId"
    WHERE o.status <> 'CANCELLED'
    GROUP BY 1, 2`,

  // Orders with where they came from (UTM, click id kind, coupon), without any customer data or the click id itself.
  orders_attributed: `
    SELECT o.id AS order_id, o."createdAt" AS ordered_at, o.status::text AS status, o.subtotal AS subtotal_vnd,
           o.discount AS discount_vnd, o.total AS total_vnd, o."couponCode" AS coupon_code, cp.source AS coupon_source,
           COALESCE(cp."campaignRef", CASE WHEN o."utmCampaign" LIKE 'ag-%' THEN o."utmCampaign" END) AS campaign_ref,
           o."utmSource" AS utm_source, o."utmMedium" AS utm_medium, o."utmCampaign" AS utm_campaign,
           o."utmContent" AS utm_content, o."clickIdType" AS click_id_type, o."landingPath" AS landing_path
    FROM "order" o
    LEFT JOIN coupon cp ON cp.code = o."couponCode"`,

  // Discounts and coupons, past, running and scheduled. `action_key` is the Idempotency-Key of the agent action that
  // created it (the agent's frequency and replace rules group discounts by it).
  promotions: `
    SELECT 'discount' AS kind, d.id::text AS ref, p.sku, d.percent AS percent, d."startsAt" AS starts_at,
           d."endsAt" AS ends_at, d."revokedAt" AS revoked_at,
           CASE WHEN d."agentActionId" IS NULL THEN 'admin' ELSE 'agent' END AS source, d."campaignRef" AS campaign_ref,
           0 AS min_order_vnd, NULL::int AS usage_limit, NULL::int AS usage_count,
           (d."revokedAt" IS NULL AND d."startsAt" <= NOW() AND d."endsAt" > NOW()) AS active,
           a."idempotencyKey" AS action_key
    FROM product_discount d
    JOIN product p ON p.id = d."productId"
    LEFT JOIN agent_action a ON a.id = d."agentActionId"
    UNION ALL
    SELECT 'coupon', c.code, NULL, c."discountPercent", c."startDate", c."expirationDate", NULL, c.source,
           c."campaignRef", c."minOrderVnd", c."usageLimit", c."usageCount",
           (c."isActive" AND c."startDate" <= NOW() AND c."expirationDate" > NOW()
            AND (c."usageLimit" IS NULL OR c."usageCount" < c."usageLimit")),
           a."idempotencyKey"
    FROM coupon c
    LEFT JOIN agent_action a ON a.id = c."agentActionId"`,

  marketing_campaigns: `
    SELECT ref, kind, objective, "threadId" AS thread_id, status, "startsAt" AS starts_at, "endsAt" AS ends_at,
           "budgetVnd" AS budget_vnd, "utmCampaign" AS utm_campaign, "createdAt" AS created_at
    FROM marketing_campaign`,

  // The agent's ads as the web holds them (status, budgets, dates); delivery is in ad_performance_daily.
  marketing_ads: `
    SELECT ref, "campaignRef" AS campaign_ref, platform, status, objective, "dailyBudgetVnd" AS daily_budget_vnd,
           "totalBudgetVnd" AS total_budget_vnd, "startsAt" AS starts_at, "endsAt" AS ends_at,
           "activatedAt" AS activated_at
    FROM ad_campaign`,

  marketing_posts: `
    SELECT ref, "campaignRef" AS campaign_ref, platform, status, "scheduledAt" AS scheduled_at,
           "publishedAt" AS published_at
    FROM marketing_post`,

  // Server-side purchase events per platform (sent, or recorded by the fakes), for the bidding rule
  // (docs/GROWTH_AGENT.md section 6: Meta and TikTok 50 in 7 days, Google 30 in 30 days).
  conversion_stats: `
    SELECT platform,
           COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days')::int AS purchases_7d,
           COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '30 days')::int AS purchases_30d
    FROM conversion_event
    WHERE status IN ('sent', 'fake')
    GROUP BY platform`,

  ad_performance_daily: `
    SELECT m."adRef" AS ad_ref, a."campaignRef" AS campaign_ref, m.platform, m.date, m.impressions, m.clicks,
           m."spendVnd" AS spend_vnd, m.conversions, m."conversionValueVnd" AS conversion_value_vnd,
           a.status AS ad_status, a.objective
    FROM ad_metric_daily m
    LEFT JOIN ad_campaign a ON a.ref = m."adRef"`,

  post_performance_daily: `
    SELECT m."postRef" AS post_ref, mp."campaignRef" AS campaign_ref, m.date, m.impressions, m.reach, m.engagements,
           m.clicks, mp."publishedAt" AS published_at
    FROM post_metric_daily m
    LEFT JOIN marketing_post mp ON mp.ref = m."postRef"`,

  // Paid-marketing budget per month; `remaining_vnd` is what new ads may still reserve.
  marketing_budget: `
    SELECT period, "capVnd" AS cap_vnd, "reservedVnd" AS reserved_vnd, "spentVnd" AS spent_vnd,
           "capVnd" - GREATEST("reservedVnd", "spentVnd") AS remaining_vnd
    FROM marketing_budget_period`,

  marketing_outcomes: `
    SELECT "threadId" AS thread_id, "campaignRef" AS campaign_ref, capability, verdict,
           "incrementalRevenueVnd" AS incremental_revenue_vnd, "incrementalProfitVnd" AS incremental_profit_vnd,
           "spendVnd" AS spend_vnd, confidence, "measuredAt" AS measured_at
    FROM marketing_outcome`,

  marketing_assets: `
    SELECT a.id AS asset_id, a.kind, a.url, a.title, p.sku, a."createdAt" AS created_at
    FROM marketing_asset a
    LEFT JOIN product p ON p.id = a."productId"`,

  // Competitor prices as observed (the freshest per URL is what counts); `watch` rows feed the site collector.
  market_competitor_prices: `
    SELECT mc.name AS competitor, mc.website AS competitor_website, p.sku, mp.url, mp.watch, mp.source, mp.title,
           mp."priceVnd" AS price_vnd, mp."observedAt" AS observed_at, mp.confidence
    FROM market_competitor_price mp
    JOIN market_competitor mc ON mc.id = mp."competitorId"
    LEFT JOIN product p ON p.id = mp."ourProductId"
    WHERE mc."isActive"`,

  market_competitor_campaigns: `
    SELECT mc.name AS competitor, cc.title, cc.category, cc."discountPct" AS discount_pct, cc."startsAt" AS starts_at,
           cc."endsAt" AS ends_at, cc.url, cc.source, cc."observedAt" AS observed_at
    FROM market_competitor_campaign cc
    JOIN market_competitor mc ON mc.id = cc."competitorId"
    WHERE mc."isActive"`,

  market_trends: `
    SELECT keyword, geo, date, interest, source FROM market_trend_point`,

  market_events: `
    SELECT code, name, "startsOn" AS starts_on, "endsOn" AS ends_on, "leadDays" AS lead_days, categories
    FROM market_event`,

  market_sources: `
    SELECT name, status, detail, "lastRunAt" AS last_run_at, "lastSuccessAt" AS last_success_at
    FROM market_source`,

  // The agent's business controls (AgentSettingDefinitions); not who changed them.
  agent_settings: `
    SELECT key, value, version, "updatedAt" AS updated_at
    FROM agent_setting
    WHERE key IN (${SETTING_KEYS})`,

  // This month's revenue target and paid-marketing cap: the owner's numbers, or the automatic ones. The reference is
  // the same month last year once there are 12 complete months of history, else the average of the last (up to) 3
  // complete months; with no history the target is empty and the cap 0.
  growth_targets: `
    WITH monthly AS (
      SELECT date_trunc('month', day)::date AS month, SUM(revenue_vnd) AS revenue_vnd
      FROM ${SCHEMA}.sales_daily
      GROUP BY 1
    ), now_month AS (
      SELECT date_trunc('month', NOW() AT TIME ZONE ${TZ})::date AS month
    ), complete AS (
      SELECT m.* FROM monthly m, now_month n WHERE m.month < n.month
    ), reference AS (
      SELECT
        (SELECT COUNT(*) FROM complete) AS complete_months,
        (SELECT ROUND(AVG(revenue_vnd)) FROM complete c, now_month n
          WHERE c.month >= n.month - INTERVAL '3 months') AS trailing_vnd,
        (SELECT revenue_vnd FROM complete c, now_month n WHERE c.month = n.month - INTERVAL '12 months') AS last_year_vnd
    ), settings AS (
      SELECT (SELECT value FROM agent_setting WHERE key = 'growth.goal') AS goal,
             (SELECT value FROM agent_setting WHERE key = 'growth.caps') AS caps
    )
    SELECT n.month,
           r.trailing_vnd::bigint AS trailing_monthly_revenue_vnd,
           CASE
             WHEN jsonb_typeof(s.goal -> 'revenue_target_vnd') = 'number' THEN (s.goal ->> 'revenue_target_vnd')::bigint
             WHEN r.complete_months >= 12 AND r.last_year_vnd IS NOT NULL
               THEN ROUND(r.last_year_vnd * ${AUTO_TARGET_UPLIFT})::bigint
             WHEN r.trailing_vnd IS NOT NULL THEN ROUND(r.trailing_vnd * ${AUTO_TARGET_UPLIFT})::bigint
           END AS revenue_target_vnd,
           CASE
             WHEN jsonb_typeof(s.goal -> 'revenue_target_vnd') = 'number' THEN 'owner'
             WHEN r.complete_months >= 12 AND r.last_year_vnd IS NOT NULL THEN 'auto_last_year'
             WHEN r.trailing_vnd IS NOT NULL THEN 'auto_trailing_3m'
             ELSE 'none'
           END AS revenue_target_source,
           CASE
             WHEN jsonb_typeof(s.caps -> 'monthly_ad_cap_vnd') = 'number' THEN (s.caps ->> 'monthly_ad_cap_vnd')::bigint
             ELSE LEAST(${AUTO_AD_CAP_MAX_VND}, ROUND(COALESCE(r.trailing_vnd, 0) * ${AUTO_AD_CAP_SHARE}))::bigint
           END AS monthly_ad_cap_vnd,
           CASE
             WHEN jsonb_typeof(s.caps -> 'monthly_ad_cap_vnd') = 'number' THEN 'owner'
             WHEN r.trailing_vnd IS NOT NULL THEN 'auto'
             ELSE 'none'
           END AS monthly_ad_cap_source
    FROM now_month n, reference r, settings s`,
};

export const ANALYTICS_VIEWS = Object.keys(VIEWS);

// Recreates every view in one transaction. A failure is logged, not fatal: the shop keeps working, but the agent
// cannot read it until this is fixed (it reports "analytics views missing").
export const applyAnalyticsViews = async (sequelize: Sequelize): Promise<void> => {
  try {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`, { transaction });
      for (const [name, select] of Object.entries(VIEWS)) {
        await sequelize.query(`DROP VIEW IF EXISTS ${SCHEMA}.${name} CASCADE`, { transaction });
        await sequelize.query(`CREATE VIEW ${SCHEMA}.${name} AS ${select}`, { transaction });
      }
    });
    Logger.INFO(`Analytics views ready: ${Object.keys(VIEWS).join(', ')}.`);
  } catch (error) {
    Logger.ERROR('Analytics views could not be created; the agent cannot read the shop until this is fixed:', error);
    failIfStrict(error); // `yarn seed-ci` and `yarn db:migrate` fail instead of leaving the agent without views
  }
};
