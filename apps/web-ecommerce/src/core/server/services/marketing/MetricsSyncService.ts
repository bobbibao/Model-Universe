import { Op, Transaction } from 'sequelize';
import AdCampaignModel from '../../database/client/models/AdCampaign.Model';
import AdMetricDailyModel from '../../database/client/models/AdMetricDaily.Model';
import MarketingPostModel from '../../database/client/models/MarketingPost.Model';
import PostMetricDailyModel from '../../database/client/models/PostMetricDaily.Model';
import Logger from '../../../../shared/server/utils/logger';
import MailService from '../MailService';
import MarketingBudgetService from '../MarketingBudgetService';
import { DAY_MS, vnDate } from '../agent/AgentLimits';
import { adPlatform, facebookPage, PlatformError, type AdRun } from './platforms';

// `POST /marketing/metrics/sync` (ingestion; the agent's monitor calls it about hourly with `sync:{yyyymmddHH}`):
// the platforms' daily numbers for the agent's ads and posts become `ad_metric_daily` / `post_metric_daily` rows,
// and each ad's new spend is booked in the budget ledger. An ad that spent its total ends; spend above the total, or
// above the month's cap, pauses ads (protective) and the admins are told. A platform that fails for one ad is
// reported and skipped, so one broken ad never blocks the others' overspend checks.

const POST_WINDOW_DAYS = 30; // posts are measured for 7 days; older ones are not read again

type Notice = { key: string; message: string };

export default class MetricsSyncService {
  private readonly ledger = new MarketingBudgetService();

  async sync(lookbackDays: number, transaction: Transaction, now = new Date(), dryRun = false): Promise<string> {
    const published = await this.publishDue(transaction, now);
    // Ads that delivered within the lookback window (an ad that ended earlier has nothing new to report).
    const ads = await AdCampaignModel.findAll({
      where: {
        activatedAt: { [Op.ne]: null },
        externalId: { [Op.ne]: null },
        status: { [Op.ne]: 'reverted' },
        [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: new Date(now.getTime() - (lookbackDays + 1) * DAY_MS) } }],
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const posts = await MarketingPostModel.findAll({
      where: {
        status: 'published',
        externalId: { [Op.ne]: null },
        publishedAt: { [Op.gt]: new Date(now.getTime() - POST_WINDOW_DAYS * DAY_MS) },
      },
      transaction,
    });
    if (dryRun) return `dry run: would sync ${ads.length} ad(s) and ${posts.length} post(s)`;

    const since = vnDate(new Date(now.getTime() - (lookbackDays - 1) * DAY_MS));
    const until = vnDate(now);
    const failed: string[] = [];
    const notices: Notice[] = [];
    for (const ad of ads) {
      try {
        await this.syncAd(ad, since, until, transaction, now, notices);
      } catch (error) {
        if (!(error instanceof PlatformError)) throw error;
        Logger.WARN(`Metrics sync: ${ad.ref} failed: ${error.message}`);
        failed.push(ad.ref);
      }
    }
    for (const post of posts) {
      try {
        await this.syncPost(post, transaction, now);
      } catch (error) {
        if (!(error instanceof PlatformError)) throw error;
        Logger.WARN(`Metrics sync: post ${post.ref} failed: ${error.message}`);
        failed.push(post.ref);
      }
    }
    const paused = await this.enforceMonthlyCap(transaction, now, notices);
    for (const notice of notices) {
      await new MailService().sendNotification(
        {
          subject: 'Quảng cáo của tác tử AI đã bị tạm dừng do vượt ngân sách',
          message: notice.message,
          severity: 'critical',
          dedupeKey: notice.key, // once a day per ad or per month
        },
        transaction,
        now,
      );
    }
    return (
      `synced ${ads.length - failed.filter((r) => ads.some((a) => a.ref === r)).length} ad(s) and ` +
      `${posts.length} post(s); ${published} scheduled post(s) went live; paused for overspend: ${paused}` +
      (failed.length ? `; failed: ${failed.join(', ')}` : '')
    );
  }

  // Scheduled posts whose time has come are live (the Page published them).
  private async publishDue(transaction: Transaction, now: Date) {
    const due = await MarketingPostModel.findAll({
      where: { status: 'scheduled', scheduledAt: { [Op.lte]: now } },
      transaction,
    });
    for (const post of due) await post.update({ status: 'published', publishedAt: post.scheduledAt }, { transaction });
    return due.length;
  }

  private async syncAd(
    ad: AdCampaignModel,
    since: string,
    until: string,
    t: Transaction,
    now: Date,
    notices: Notice[],
  ) {
    const run: AdRun = {
      ref: ad.ref,
      externalId: ad.externalId ?? '',
      platformData: ad.platformData ?? {},
      dailyBudgetVnd: ad.dailyBudgetVnd,
      totalBudgetVnd: ad.totalBudgetVnd,
      activatedAt: ad.activatedAt ?? null,
      endsAt: ad.endsAt ?? now,
      status: ad.status,
    };
    const client = adPlatform(ad.platform);
    for (const day of await client.insights(run, since, until)) {
      const existing = await AdMetricDailyModel.findOne({ where: { adRef: ad.ref, date: day.date }, transaction: t });
      const newSpend = day.spendVnd - (existing?.spendVnd ?? 0);
      const values = {
        impressions: day.impressions,
        clicks: day.clicks,
        spendVnd: day.spendVnd,
        conversions: day.conversions,
        conversionValueVnd: day.conversionValueVnd,
      };
      if (existing) await existing.update(values, { transaction: t });
      else
        await AdMetricDailyModel.create(
          { adRef: ad.ref, platform: ad.platform, date: day.date, ...values },
          { transaction: t },
        );
      // Booked in the month the spend happened (noon in Vietnam of that day).
      if (newSpend > 0) await this.ledger.recordSpend(ad.ref, newSpend, new Date(`${day.date}T12:00:00+07:00`), t);
    }

    const spent = await this.ledger.spent(ad.ref, t);
    const over = spent > ad.totalBudgetVnd;
    const finished = spent >= ad.totalBudgetVnd || (ad.endsAt !== null && ad.endsAt !== undefined && ad.endsAt <= now);
    if (finished && ['active', 'paused'].includes(ad.status)) {
      if (ad.status === 'active')
        await client.pause({ ref: ad.ref, externalId: run.externalId, platformData: run.platformData });
      await ad.update({ status: 'ended' }, { transaction: t });
      await this.ledger.release(ad.ref, t);
    }
    if (over) {
      notices.push({
        key: `overspend:ad:${ad.ref}`,
        message: `Quảng cáo ${ad.ref} đã chi ${spent} VND, vượt tổng ngân sách ${ad.totalBudgetVnd} VND.`,
      });
    }
  }

  // A post's lifetime totals: today's row is what was added since the earlier days' rows.
  private async syncPost(post: MarketingPostModel, t: Transaction, now: Date) {
    const totals = await facebookPage().totals(post.externalId as string, post.publishedAt ?? now, now);
    const today = vnDate(now);
    const earlier = await PostMetricDailyModel.findAll({
      where: { postRef: post.ref, date: { [Op.lt]: today } },
      transaction: t,
    });
    const before = (field: 'impressions' | 'reach' | 'engagements' | 'clicks') =>
      earlier.reduce((sum, row) => sum + row[field], 0);
    const values = {
      impressions: Math.max(0, totals.impressions - before('impressions')),
      reach: Math.max(0, totals.reach - before('reach')),
      engagements: Math.max(0, totals.engagements - before('engagements')),
      clicks: Math.max(0, totals.clicks - before('clicks')),
    };
    const existing = await PostMetricDailyModel.findOne({ where: { postRef: post.ref, date: today }, transaction: t });
    if (existing) await existing.update(values, { transaction: t });
    else await PostMetricDailyModel.create({ postRef: post.ref, date: today, ...values }, { transaction: t });
  }

  // Over the month's cap: every delivering agent ad stops (protective).
  private async enforceMonthlyCap(t: Transaction, now: Date, notices: Notice[]) {
    const budget = await this.ledger.state(t, now);
    if (budget.spent_vnd <= budget.cap_vnd) return 0;
    const active = await AdCampaignModel.findAll({ where: { status: 'active' }, transaction: t, lock: t.LOCK.UPDATE });
    for (const ad of active) {
      await adPlatform(ad.platform).pause({
        ref: ad.ref,
        externalId: ad.externalId ?? '',
        platformData: ad.platformData ?? {},
      });
      await ad.update({ status: 'paused' }, { transaction: t });
    }
    notices.push({
      key: `overspend:month:${vnDate(now).slice(0, 7)}`,
      message:
        `Chi tiêu quảng cáo tháng ${vnDate(now).slice(0, 7)} là ${budget.spent_vnd} VND, vượt hạn mức ${budget.cap_vnd} VND; ` +
        `${active.length} quảng cáo đã bị tạm dừng.`,
    });
    return active.length;
  }
}
