import { Op, QueryTypes, Transaction } from 'sequelize';
import AdCampaignModel from '../database/client/models/AdCampaign.Model';
import CouponModel from '../database/client/models/Coupon.Model';
import MarketingCampaignModel from '../database/client/models/MarketingCampaign.Model';
import MarketingPostModel from '../database/client/models/MarketingPost.Model';
import ProductDiscountModel from '../database/client/models/ProductDiscount.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';
import AgentPolicyService from './agent/AgentPolicyService';
import MailService from './MailService';
import MarketingBudgetService from './MarketingBudgetService';
import { adPlatform } from './marketing/platforms';

// The agent's campaigns for the admins (/admin/agent/campaigns): what each one runs (ads, posts, promotions), its
// spend, and the protective controls the web keeps for itself: end a campaign, pause an ad, pause every agent ad.
// These run like agent writes (serialized with them) and every admin is told.

const CAMPAIGN_PAGE = 50;

export interface CampaignOverview {
  ref: string;
  name: string;
  kind: string;
  objective: string;
  status: string;
  channels: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  budgetVnd: number;
  threadId: string | null;
  ads: {
    ref: string;
    platform: string;
    status: string;
    objective: string;
    dailyBudgetVnd: number;
    totalBudgetVnd: number;
    spentVnd: number;
    endsAt: Date | null;
  }[];
  posts: { ref: string; status: string; at: Date | null; link: string | null }[];
  coupons: { code: string; percent: number; active: boolean }[];
  activeDiscounts: number;
}

// The growth scorecard (/admin/agent/growth): this month against the revenue goal, what the agent's campaigns
// brought, what they cost, and ROAS per platform. Read from the same analytics views the agent reads.
export interface GrowthScorecard {
  month: string;
  revenue_vnd: number;
  target_vnd: number | null;
  pace_vnd: number | null; // the target spread evenly over the month's days, up to yesterday
  attributed_revenue_vnd: number; // orders carrying an agent campaign's utm_campaign or coupon
  incremental_profit_vnd: number; // measured outcomes this month
  outcomes: Record<string, number>; // verdict -> count
  spend_vnd: number;
  ad_cap_vnd: number;
  roas: { platform: string; spend_vnd: number; conversion_value_vnd: number; roas: number | null }[];
}

const MONTH = `date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

export default class MarketingCampaignService {
  private readonly policy = new AgentPolicyService();

  async scorecard(): Promise<GrowthScorecard> {
    const db = DatabaseProvider.getInstance();
    const one = async (sql: string) =>
      (await db.query<Record<string, unknown>>(sql, { type: QueryTypes.SELECT }))[0] ?? {};
    const sales = await one(`
      SELECT ${MONTH}::text AS month, COALESCE(SUM(revenue_vnd), 0)::bigint AS revenue,
             (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - ${MONTH} AS days_done,
             (${MONTH} + INTERVAL '1 month')::date - ${MONTH} AS days_in_month
      FROM analytics.sales_daily WHERE day >= ${MONTH}`);
    const targets = await one('SELECT revenue_target_vnd, monthly_ad_cap_vnd FROM analytics.growth_targets');
    const attributed = await one(`
      SELECT COALESCE(SUM(total_vnd), 0)::bigint AS revenue FROM analytics.orders_attributed
      WHERE campaign_ref LIKE 'ag-%' AND status <> 'CANCELLED' AND ordered_at >= ${MONTH}`);
    const outcomes = await db.query<{ verdict: string; n: number; profit: string }>(
      `SELECT verdict, COUNT(*)::int AS n, COALESCE(SUM(incremental_profit_vnd), 0)::bigint AS profit
       FROM analytics.marketing_outcomes WHERE measured_at >= ${MONTH} GROUP BY verdict`,
      { type: QueryTypes.SELECT },
    );
    const budget = await one(
      `SELECT spent_vnd FROM analytics.marketing_budget WHERE period = to_char(${MONTH}, 'YYYY-MM')`,
    );
    const roas = await db.query<{ platform: string; spend: string; value: string }>(
      `SELECT platform, COALESCE(SUM(spend_vnd), 0)::bigint AS spend,
              COALESCE(SUM(conversion_value_vnd), 0)::bigint AS value
       FROM analytics.ad_performance_daily WHERE date >= ${MONTH} GROUP BY platform ORDER BY platform`,
      { type: QueryTypes.SELECT },
    );
    const target = targets.revenue_target_vnd == null ? null : Number(targets.revenue_target_vnd);
    const daysDone = Number(sales.days_done ?? 0);
    const daysInMonth = Number(sales.days_in_month ?? 30);
    return {
      month: String(sales.month ?? ''),
      revenue_vnd: Number(sales.revenue ?? 0),
      target_vnd: target,
      pace_vnd: target == null ? null : Math.round((target * daysDone) / daysInMonth),
      attributed_revenue_vnd: Number(attributed.revenue ?? 0),
      incremental_profit_vnd: outcomes.reduce((sum, row) => sum + Number(row.profit), 0),
      outcomes: Object.fromEntries(outcomes.map((row) => [row.verdict, row.n])),
      spend_vnd: Number(budget.spent_vnd ?? 0),
      ad_cap_vnd: Number(targets.monthly_ad_cap_vnd ?? 0),
      roas: roas.map((row) => ({
        platform: row.platform,
        spend_vnd: Number(row.spend),
        conversion_value_vnd: Number(row.value),
        roas: Number(row.spend) > 0 ? Number(row.value) / Number(row.spend) : null,
      })),
    };
  }

  async list(): Promise<{ campaigns: CampaignOverview[]; activeAds: number }> {
    const now = new Date();
    const campaigns = await MarketingCampaignModel.findAll({ where: { agentActionId: { [Op.ne]: null } }, order: [['id', 'DESC']], limit: CAMPAIGN_PAGE });
    const refs = campaigns.map((c) => c.ref);
    const [ads, posts, coupons, discounts, spend, activeAds] = await Promise.all([
      AdCampaignModel.findAll({ where: { campaignRef: { [Op.in]: refs } }, order: [['id', 'ASC']] }),
      MarketingPostModel.findAll({ where: { campaignRef: { [Op.in]: refs } }, order: [['id', 'ASC']] }),
      CouponModel.findAll({ where: { campaignRef: { [Op.in]: refs }, source: 'agent' } }),
      ProductDiscountModel.findAll({
        where: {
          campaignRef: { [Op.in]: refs },
          revokedAt: null,
          startsAt: { [Op.lte]: now },
          endsAt: { [Op.gt]: now },
        },
        attributes: ['campaignRef'],
      }),
      DatabaseProvider.getInstance().query<{ adRef: string; spent: string }>(
        'SELECT "adRef", SUM("spendVnd") AS spent FROM ad_metric_daily GROUP BY "adRef"',
        { type: QueryTypes.SELECT },
      ),
      AdCampaignModel.count({ where: { status: 'active', agentActionId: { [Op.ne]: null } } }),
    ]);
    const spent = new Map(spend.map((row) => [row.adRef, Number(row.spent)]));
    return {
      activeAds,
      campaigns: campaigns.map((c) => ({
        ref: c.ref,
        name: c.name,
        kind: c.kind,
        objective: c.objective,
        status: c.status,
        channels: c.channels,
        startsAt: c.startsAt ?? null,
        endsAt: c.endsAt ?? null,
        budgetVnd: c.budgetVnd,
        threadId: c.threadId ?? null,
        ads: ads
          .filter((a) => a.campaignRef === c.ref)
          .map((a) => ({
            ref: a.ref,
            platform: a.platform,
            status: a.status,
            objective: a.objective,
            dailyBudgetVnd: a.dailyBudgetVnd,
            totalBudgetVnd: a.totalBudgetVnd,
            spentVnd: spent.get(a.ref) ?? 0,
            endsAt: a.endsAt ?? null,
          })),
        posts: posts
          .filter((p) => p.campaignRef === c.ref)
          .map((p) => ({
            ref: p.ref,
            status: p.status,
            at: p.publishedAt ?? p.scheduledAt ?? null,
            link: p.link ?? null,
          })),
        coupons: coupons
          .filter((cp) => cp.campaignRef === c.ref)
          .map((cp) => ({
            code: cp.code,
            percent: cp.discountPercent,
            active: cp.isActive && cp.startDate <= now && cp.expirationDate > now,
          })),
        activeDiscounts: discounts.filter((d) => d.campaignRef === c.ref).length,
      })),
    };
  }

  // Ends the campaign now: its agent promotions stop, its ads end (their unspent budget is released).
  async endCampaign(ref: string, adminId: number) {
    const detail = await this.protective(async (transaction, now) => {
      const campaign = await MarketingCampaignModel.findOne({
        where: { ref },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!campaign) throw HttpError.notFound('Không tìm thấy chiến dịch.');
      const [coupons] = await CouponModel.update(
        { isActive: false },
        { where: { campaignRef: ref, source: 'agent', isActive: true }, transaction },
      );
      const [discounts] = await ProductDiscountModel.update(
        { revokedAt: now },
        {
          where: { campaignRef: ref, agentActionId: { [Op.ne]: null }, revokedAt: null, endsAt: { [Op.gt]: now } },
          transaction,
        },
      );
      const ads = await AdCampaignModel.findAll({
        where: { campaignRef: ref, status: { [Op.in]: ['active', 'paused'] } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const ad of ads) await this.stopAd(ad, 'ended', transaction);
      if (!['ended', 'reverted'].includes(campaign.status)) await campaign.update({ status: 'ended' }, { transaction });
      return `Chiến dịch ${ref} đã kết thúc: ${coupons} mã giảm giá, ${discounts} giảm giá sản phẩm và ${ads.length} quảng cáo đã dừng.`;
    });
    await this.notify('Quản trị viên đã kết thúc một chiến dịch marketing', detail, adminId);
    return detail;
  }

  async pauseAd(ref: string, adminId: number) {
    const detail = await this.protective(async (transaction) => {
      const ad = await AdCampaignModel.findOne({ where: { ref }, transaction, lock: transaction.LOCK.UPDATE });
      if (!ad) throw HttpError.notFound('Không tìm thấy quảng cáo.');
      if (ad.status !== 'active') return `Quảng cáo ${ref} không chạy (${ad.status}).`;
      await this.stopAd(ad, 'paused', transaction);
      return `Quảng cáo ${ref} đã tạm dừng.`;
    });
    await this.notify('Quản trị viên đã tạm dừng một quảng cáo marketing', detail, adminId);
    return detail;
  }

  // The "pause all agent ads" control: every delivering agent ad stops.
  async pauseAllAds(adminId: number) {
    const detail = await this.protective(async (transaction) => {
      const ads = await AdCampaignModel.findAll({
        where: { status: 'active', agentActionId: { [Op.ne]: null } },
        order: [['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const ad of ads) await this.stopAd(ad, 'paused', transaction);
      return `${ads.length} quảng cáo của Agent đã tạm dừng.`;
    });
    await this.notify('Quản trị viên đã tạm dừng toàn bộ quảng cáo của Agent', detail, adminId);
    return detail;
  }

  private async protective(apply: (transaction: Transaction, now: Date) => Promise<string>) {
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await this.policy.serialize(transaction);
      return apply(transaction, new Date());
    });
  }

  // Pauses it on its platform (a delivering ad); `ended` also releases what it reserved and has not spent.
  private async stopAd(ad: AdCampaignModel, status: 'paused' | 'ended', transaction: Transaction) {
    if (ad.status === 'active' && ad.externalId) {
      await adPlatform(ad.platform).pause({
        ref: ad.ref,
        externalId: ad.externalId,
        platformData: ad.platformData ?? {},
      });
    }
    await ad.update({ status }, { transaction });
    if (status === 'ended') await new MarketingBudgetService().release(ad.ref, transaction);
  }

  private async notify(subject: string, detail: string, adminId: number) {
    Logger.INFO(`[MarketingCampaignService] admin #${adminId}: ${detail}`);
    try {
      await new MailService().sendNotification({
        subject,
        message: `${detail}\nThực hiện bởi quản trị viên #${adminId}.`,
        severity: 'warning',
      });
    } catch (error) {
      Logger.ERROR('Could not notify the admins of a campaign control:', error);
    }
  }
}
