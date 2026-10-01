import { QueryTypes, Transaction } from 'sequelize';
import DatabaseProvider from '../../database/Database.Provider';
import AgentSettingService from '../AgentSettingService';
import MarketingBudgetService from '../MarketingBudgetService';
import { AGENT_SETTING_KEYS, type AgentSettings } from '../AgentSettingDefinitions';
import { PROMO_FREQUENCY_DAYS, type AdPlatformName, type ShopState } from './AgentLimits';

// The shop as the agent's rules see it (AgentLimits `ShopState`), read inside the request's transaction. A small
// shop: products, coupons, campaigns, ads and assets are read whole; discounts and posts only as far back as a rule
// looks (30 days).
type Row = Record<string, unknown>;

const date = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string));
const int = (value: unknown) => Number(value ?? 0);

export const loadShopState = async (transaction: Transaction, now = new Date()): Promise<ShopState> => {
  const sequelize = DatabaseProvider.getInstance();
  const select = (sql: string) =>
    sequelize.query<Row>(sql, {
      type: QueryTypes.SELECT,
      transaction,
      replacements: { now, days: PROMO_FREQUENCY_DAYS + 1 },
    });

  const entries = await new AgentSettingService().getAll(transaction);
  const settings = Object.fromEntries(entries.map((entry) => [entry.key, entry.value])) as unknown as AgentSettings;
  for (const key of AGENT_SETTING_KEYS) if (!(key in settings)) throw new Error(`setting ${key} missing`);

  // One connection per transaction: the reads run one after another.
  const products = await select(`
      SELECT p.sku, c.slug AS category, p.price, p."importPrice" AS cost, p."createdAt" AS created_at,
             (SELECT MAX(si."createdAt") FROM stock_import_item sii
                JOIN stock_import si ON si.id = sii."stockImportId"
               WHERE sii."productId" = p.id) AS last_received_at
      FROM product p JOIN category c ON c.id = p."categoryId"
      WHERE NOT p."isArchived"`);
  const discounts = await select(`
      SELECT p.sku, d.percent, d."startsAt" AS starts_at, d."endsAt" AS ends_at, d."revokedAt" AS revoked_at,
             d."campaignRef" AS campaign_ref, d.id, a."idempotencyKey" AS action_key, d."agentActionId" AS agent_action_id
      FROM product_discount d
      JOIN product p ON p.id = d."productId"
      LEFT JOIN agent_action a ON a.id = d."agentActionId"
      WHERE d."endsAt" > :now OR d."startsAt" > CAST(:now AS timestamptz) - (:days || ' days')::interval`);
  const coupons = await select(`
      SELECT code, "discountPercent" AS percent, source, "campaignRef" AS campaign_ref,
             ("isActive" AND "startDate" <= :now AND "expirationDate" > :now
              AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")) AS usable
      FROM coupon`);
  const campaigns = await select('SELECT ref, "budgetVnd" AS budget_vnd, status FROM marketing_campaign');
  const ads = await select(`
      SELECT ref, "campaignRef" AS campaign_ref, platform, status, "dailyBudgetVnd" AS daily,
             "totalBudgetVnd" AS total, "endsAt" AS ends_at
      FROM ad_campaign`);
  const posts = await select(`
      SELECT ref, COALESCE("publishedAt", "scheduledAt") AS at
      FROM marketing_post
      WHERE status <> 'removed' AND status <> 'failed'
        AND COALESCE("publishedAt", "scheduledAt") > CAST(:now AS timestamptz) - (:days || ' days')::interval`);
  const assets = await select('SELECT id, kind FROM marketing_asset');
  const measured = await select(`SELECT DISTINCT capability FROM marketing_outcome WHERE capability LIKE 'ads\\_%'`);

  return {
    now,
    settings,
    products: products.map((r) => ({
      sku: String(r.sku),
      category: String(r.category),
      price_vnd: int(r.price),
      cost_vnd: int(r.cost),
      created_at: date(r.created_at) as Date,
      last_received_at: date(r.last_received_at),
    })),
    discounts: discounts.map((r) => ({
      sku: String(r.sku),
      percent: Number(r.percent),
      source: r.agent_action_id ? 'agent' : 'admin',
      action: String(r.action_key ?? `discount-${r.id}`),
      starts_at: date(r.starts_at) as Date,
      ends_at: date(r.ends_at) as Date,
      revoked: r.revoked_at !== null,
      campaign_ref: (r.campaign_ref as string | null) ?? null,
    })),
    coupons: coupons.map((r) => ({
      code: String(r.code),
      percent: Number(r.percent),
      source: r.source === 'agent' ? 'agent' : 'admin',
      usable: Boolean(r.usable),
      campaign_ref: (r.campaign_ref as string | null) ?? null,
    })),
    campaigns: campaigns.map((r) => ({ ref: String(r.ref), budget_vnd: int(r.budget_vnd), status: String(r.status) })),
    ads: ads.map((r) => ({
      ref: String(r.ref),
      campaign_ref: (r.campaign_ref as string | null) ?? null,
      platform: r.platform as AdPlatformName,
      status: String(r.status),
      daily_budget_vnd: int(r.daily),
      total_budget_vnd: int(r.total),
      ends_at: date(r.ends_at) ?? now,
    })),
    posts: posts.map((r) => ({ ref: String(r.ref), at: date(r.at) as Date })),
    assets: assets.map((r) => ({ id: int(r.id), kind: r.kind === 'video' ? 'video' : 'image' })),
    budget: await new MarketingBudgetService().state(transaction, now),
    measured_platforms: measured.map((r) => String(r.capability).replace(/^ads_/, '')),
  };
};
