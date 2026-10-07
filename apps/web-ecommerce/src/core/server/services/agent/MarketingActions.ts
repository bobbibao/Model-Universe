import { Transaction } from 'sequelize';
import AdCampaignModel from '../../database/client/models/AdCampaign.Model';
import MarketingAssetModel from '../../database/client/models/MarketingAsset.Model';
import MarketingPostModel from '../../database/client/models/MarketingPost.Model';
import ProductImageModel from '../../database/client/models/ProductImage.Model';
import ProductModel from '../../database/client/models/Product.Model';
import { AgentApiError } from '../../../../shared/server/utils/AgentApiUtils';
import MarketingBudgetService from '../MarketingBudgetService';
import { adPlatform, facebookPage, shopPublicUrl, type NewAd, type PlatformAd } from '../marketing/platforms';
import {
  daysUntil,
  publishTime,
  startOf,
  type AdBody,
  type AdPlatformName,
  type BudgetBody,
  type OptimizationBody,
  type PostBody,
} from './AgentLimits';
import { DAY_MS, type Applied, type UndoData, type WriteContext } from './AgentWrites';

// Facebook posts and paid ads (docs/GROWTH_AGENT.md section 3). The web builds every link (utm parameters, so orders
// are attributed to the campaign) and every media URL; the platform call comes last, after the rows and the budget
// ledger are written, so a refusal by the platform (502) rolls the whole request back. A dry run never calls out.

const UTM_SOURCE: Record<AdPlatformName, string> = { meta: 'facebook', google: 'google', tiktok: 'tiktok' };

const absolute = (url: string) => (/^https?:\/\//i.test(url) ? url : `${shopPublicUrl()}/${url.replace(/^\/+/, '')}`);

// A storefront path with its tracking parameters, as an absolute URL.
export const trackedLink = (path: string, utm: Record<string, string>) => {
  const url = new URL(path, `${shopPublicUrl()}/`);
  for (const [key, value] of Object.entries(utm)) url.searchParams.set(key, value);
  return url.toString();
};

const productImageUrl = async (sku: string, transaction: Transaction) => {
  const product = await ProductModel.findOne({ where: { sku }, transaction });
  if (!product) throw new AgentApiError('not_found', `unknown SKU ${sku}`);
  const image = await ProductImageModel.findOne({
    where: { productId: product.id },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction,
  });
  return image ? absolute(image.url) : product.imageUrl ? absolute(product.imageUrl) : null;
};

const assetUrl = async (id: number, transaction: Transaction) => {
  const asset = await MarketingAssetModel.findByPk(id, { transaction });
  if (!asset) throw new AgentApiError('not_found', `no marketing asset ${id}`);
  return absolute(asset.url);
};

// ------------------------------------------------------------------ posts

export const createPost = async ({ body, transaction, actionId, now, dryRun }: WriteContext<PostBody>) => {
  const link = body.link_path
    ? trackedLink(body.link_path, {
        utm_source: 'facebook',
        utm_medium: 'social',
        utm_campaign: body.campaign_ref ?? body.ref,
      })
    : null;
  const imageUrl = body.asset_id
    ? await assetUrl(body.asset_id, transaction)
    : body.sku
      ? await productImageUrl(body.sku, transaction)
      : null;
  const at = publishTime(body.scheduled_at, now);
  const scheduled = at.getTime() > now.getTime();
  const post = await MarketingPostModel.create(
    {
      ref: body.ref,
      campaignRef: body.campaign_ref ?? null,
      platform: 'facebook',
      message: body.message,
      link,
      imageUrl,
      status: scheduled ? 'scheduled' : 'published',
      scheduledAt: scheduled ? at : null,
      publishedAt: scheduled ? null : now,
      agentActionId: actionId,
    },
    { transaction },
  );
  if (!dryRun) {
    const published = await facebookPage().publish({
      message: body.message,
      link,
      imageUrl,
      scheduledAt: scheduled ? at : null,
    });
    await post.update({ externalId: published.externalId }, { transaction });
  }
  return {
    detail: scheduled ? `post ${body.ref} scheduled for ${at.toISOString()}` : `post ${body.ref} published`,
    undo: { kind: 'post', ref: body.ref },
  } satisfies Applied;
};

export const revertPost = async (ref: string, transaction: Transaction, now: Date) => {
  const post = await MarketingPostModel.findOne({ where: { ref }, transaction, lock: transaction.LOCK.UPDATE });
  if (!post) return `post ${ref} no longer exists`;
  if (post.status === 'removed') return `post ${ref} already removed`;
  if (post.externalId) await facebookPage().remove(post.externalId);
  await post.update({ status: 'removed', removedAt: now }, { transaction });
  return `post ${ref} deleted from the Page`;
};

// ------------------------------------------------------------------ ads

const platformAd = (ad: AdCampaignModel): PlatformAd => ({
  ref: ad.ref,
  externalId: ad.externalId ?? '',
  platformData: ad.platformData ?? {},
});

// The ad as the platform is asked to create it, rebuilt from its row (also for a platform that replaces it).
export const newAdOf = (ad: AdCampaignModel): NewAd => {
  const creative = ad.creative as Record<string, unknown>;
  const text = (key: string) => (typeof creative[key] === 'string' ? (creative[key] as string) : null);
  const list = (key: string) => (Array.isArray(creative[key]) ? (creative[key] as string[]) : []);
  return {
    ref: ad.ref,
    name: `${ad.campaignRef ?? 'agent'} ${ad.ref}`,
    objective: ad.objective === 'conversions' ? 'conversions' : 'traffic',
    dailyBudgetVnd: ad.dailyBudgetVnd,
    startsAt: ad.startsAt ?? new Date(),
    endsAt: ad.endsAt ?? new Date(),
    landingUrl: trackedLink(ad.linkPath, {
      utm_source: UTM_SOURCE[ad.platform],
      utm_medium: 'cpc',
      utm_campaign: ad.campaignRef ?? ad.ref,
      utm_content: ad.ref,
    }),
    creative: {
      headline: text('headline'),
      primary_text: text('primary_text'),
      headlines: list('headlines'),
      descriptions: list('descriptions'),
      keywords: list('keywords'),
      ad_text: text('ad_text'),
      imageUrl: text('image_url'),
      videoUrl: text('video_url'),
    },
  };
};

const lockAd = async (ref: string, transaction: Transaction) => {
  const ad = await AdCampaignModel.findOne({ where: { ref }, transaction, lock: transaction.LOCK.UPDATE });
  if (!ad) throw new AgentApiError('not_found', `no ad ${ref}`);
  return ad;
};

const isOpen = (ad: AdCampaignModel) => !['ended', 'reverted'].includes(ad.status);

// Created paused on the platform; its whole budget (daily x days) is reserved in this month's ledger.
export const createAd = async ({ body, transaction, actionId, now, dryRun }: WriteContext<AdBody>) => {
  const start = startOf(body.starts_at, now);
  const total = body.daily_budget_vnd * body.duration_days;
  const media = body.asset_id
    ? await assetUrl(body.asset_id, transaction)
    : body.sku
      ? await productImageUrl(body.sku, transaction)
      : null;
  const creative = Object.fromEntries(
    Object.entries({
      headline: body.headline,
      primary_text: body.primary_text,
      headlines: body.headlines,
      descriptions: body.descriptions,
      keywords: body.keywords,
      ad_text: body.ad_text,
      sku: body.sku,
      asset_id: body.asset_id,
      [body.platform === 'tiktok' ? 'video_url' : 'image_url']: media,
    }).filter(([, value]) => value !== undefined && value !== null),
  );
  const ad = await AdCampaignModel.create(
    {
      ref: body.ref,
      campaignRef: body.campaign_ref,
      platform: body.platform,
      status: 'paused',
      objective: body.objective ?? 'traffic',
      dailyBudgetVnd: body.daily_budget_vnd,
      totalBudgetVnd: total,
      startsAt: start,
      endsAt: new Date(start.getTime() + body.duration_days * DAY_MS),
      linkPath: body.link_path,
      creative,
      platformData: {},
      agentActionId: actionId,
    },
    { transaction },
  );
  await new MarketingBudgetService().reserve(body.ref, total, actionId, transaction, now);
  if (!dryRun) {
    const created = await adPlatform(body.platform).createPaused(newAdOf(ad));
    await ad.update({ externalId: created.externalId, platformData: created.platformData }, { transaction });
  }
  return {
    detail: `${body.platform} ad ${body.ref} created paused; ${total} VND reserved`,
    undo: { kind: 'ad', ref: body.ref },
  } satisfies Applied;
};

export const activateAd = async ({ path, transaction, now, dryRun }: WriteContext<unknown>): Promise<Applied> => {
  const ad = await lockAd(path.ref, transaction);
  if (ad.status === 'active') return { detail: `ad ${ad.ref} is already active`, undo: null };
  const previous = ad.status;
  if (!dryRun) await adPlatform(ad.platform).activate(platformAd(ad));
  await ad.update({ status: 'active', activatedAt: ad.activatedAt ?? now }, { transaction });
  return { detail: `ad ${ad.ref} activated`, undo: { kind: 'activation', ref: ad.ref, previous } };
};

// Protective: always allowed; pausing a paused or ended ad is harmless.
export const pauseAd = async ({ path, transaction, dryRun }: WriteContext<unknown>): Promise<Applied> => {
  const ad = await lockAd(path.ref, transaction);
  if (ad.status !== 'active') return { detail: `ad ${ad.ref} is ${ad.status}; nothing to pause`, undo: null };
  if (!dryRun) await adPlatform(ad.platform).pause(platformAd(ad));
  await ad.update({ status: 'paused' }, { transaction });
  return { detail: `ad ${ad.ref} paused`, undo: null };
};

// The difference (new - old daily) x the days left is reserved (a raise, shop_change) or released (a cut,
// protective); the ad's total never drops below what it already spent.
export const setAdBudget = async ({
  body,
  path,
  transaction,
  actionId,
  now,
  dryRun,
}: WriteContext<BudgetBody>): Promise<Applied> => {
  const ad = await lockAd(path.ref, transaction);
  const daily = body.daily_budget_vnd;
  const before = { daily: ad.dailyBudgetVnd, total: ad.totalBudgetVnd };
  if (daily === before.daily) return { detail: `ad ${ad.ref} already has ${daily} VND a day`, undo: null };
  const ledger = new MarketingBudgetService();
  const delta = (daily - before.daily) * daysUntil(now, ad.endsAt ?? now);
  const spent = await ledger.spent(ad.ref, transaction);
  if (delta > 0) await ledger.reserve(ad.ref, delta, actionId, transaction, now);
  else await ledger.release(ad.ref, transaction, -delta, actionId);
  if (!dryRun && isOpen(ad)) await adPlatform(ad.platform).setDailyBudget(platformAd(ad), daily);
  await ad.update({ dailyBudgetVnd: daily, totalBudgetVnd: Math.max(spent, before.total + delta) }, { transaction });
  return {
    detail: `ad ${ad.ref}: ${before.daily} -> ${daily} VND a day (${delta >= 0 ? '+' : ''}${delta} VND)`,
    undo: delta > 0 ? { kind: 'budget', ref: ad.ref, daily: before.daily, total: before.total, reserved: delta } : null,
  };
};

// Switches the bidding; Meta and TikTok replace the campaign (their objective is fixed), which then resumes if the
// ad was delivering.
const switchObjective = async (ad: AdCampaignModel, objective: 'traffic' | 'conversions', transaction: Transaction) => {
  const client = adPlatform(ad.platform);
  const replacement = await client.setObjective(platformAd(ad), objective, newAdOf(ad));
  if (replacement) {
    if (ad.status === 'active') await client.activate(replacement);
    await ad.update({ externalId: replacement.externalId, platformData: replacement.platformData }, { transaction });
  }
};

export const setAdOptimization = async ({
  body,
  path,
  transaction,
  dryRun,
}: WriteContext<OptimizationBody>): Promise<Applied> => {
  const ad = await lockAd(path.ref, transaction);
  if (ad.objective === body.objective)
    return { detail: `ad ${ad.ref} already optimises for ${body.objective}`, undo: null };
  const previous = ad.objective === 'conversions' ? 'conversions' : 'traffic';
  if (!dryRun) await switchObjective(ad, body.objective, transaction);
  await ad.update({ objective: body.objective }, { transaction });
  return {
    detail: `ad ${ad.ref}: ${previous} -> ${body.objective}`,
    undo: { kind: 'objective', ref: ad.ref, previous },
  };
};

// ------------------------------------------------------------------ compensation

type AdUndo = Extract<UndoData, { kind: 'ad' | 'activation' | 'budget' | 'objective' }>;

export const revertAdChange = async (undo: AdUndo, transaction: Transaction): Promise<string> => {
  const ad = await AdCampaignModel.findOne({ where: { ref: undo.ref }, transaction, lock: transaction.LOCK.UPDATE });
  if (!ad) return `ad ${undo.ref} no longer exists`;
  const client = adPlatform(ad.platform);
  const ledger = new MarketingBudgetService();
  switch (undo.kind) {
    case 'ad': {
      if (ad.status === 'reverted') return `ad ${ad.ref} already reverted`;
      if (ad.status === 'active' && ad.externalId) await client.pause(platformAd(ad));
      await ad.update({ status: 'reverted' }, { transaction });
      const released = await ledger.release(ad.ref, transaction);
      return `ad ${ad.ref} stopped; ${released} VND released`;
    }
    case 'activation': {
      if (ad.status !== 'active') return `ad ${ad.ref} is ${ad.status}; left as is`;
      await client.pause(platformAd(ad));
      await ad.update({ status: undo.previous === 'active' ? 'paused' : undo.previous }, { transaction });
      return `ad ${ad.ref} paused`;
    }
    case 'budget': {
      const spent = await ledger.spent(ad.ref, transaction);
      await ledger.release(ad.ref, transaction, undo.reserved);
      if (isOpen(ad)) await client.setDailyBudget(platformAd(ad), undo.daily);
      await ad.update({ dailyBudgetVnd: undo.daily, totalBudgetVnd: Math.max(spent, undo.total) }, { transaction });
      return `ad ${ad.ref} back to ${undo.daily} VND a day`;
    }
    case 'objective': {
      if (ad.objective === undo.previous) return `ad ${ad.ref} already optimises for ${undo.previous}`;
      if (isOpen(ad)) await switchObjective(ad, undo.previous, transaction);
      await ad.update({ objective: undo.previous }, { transaction });
      return `ad ${ad.ref} back to ${undo.previous}`;
    }
  }
};
