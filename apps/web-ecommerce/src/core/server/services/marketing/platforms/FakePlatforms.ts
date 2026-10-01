import { createHash } from 'crypto';
import { vnDate, type AdPlatformName } from '../../agent/AgentLimits';
import {
  daysBetween,
  type AdInsight,
  type AdPlatformClient,
  type AdRun,
  type FacebookPageClient,
  type NewAd,
  type PagePost,
  type PlatformAd,
  type PostTotals,
} from './types';

// The default platforms (`*_MODE=fake`): nothing leaves the shop. Ids start with `fake-`; metrics are simulated from
// each ad's budget and the days it ran, the same for the same ad and day, so a sync, the budget ledger and the
// agent's guard see realistic, repeatable numbers. Every call is recorded (tests read `calls`).

const AVERAGE_ORDER_VND = 600_000;

// A stable number in [0, 1000) for the given parts.
export const roll = (...parts: unknown[]) =>
  createHash('sha256').update(parts.map(String).join('|')).digest().readUInt32BE(0) % 1000;

export class FakeAdPlatform implements AdPlatformClient {
  readonly mode = 'fake' as const;
  readonly calls: { method: string; ref: string; args: unknown }[] = [];
  private static counter = 0;

  constructor(readonly platform: AdPlatformName) {}

  async createPaused(ad: NewAd) {
    this.calls.push({ method: 'createPaused', ref: ad.ref, args: ad });
    FakeAdPlatform.counter += 1;
    return { externalId: `fake-${this.platform}-${ad.ref}`, platformData: { fake: String(FakeAdPlatform.counter) } };
  }

  async activate(ad: PlatformAd) {
    this.calls.push({ method: 'activate', ref: ad.ref, args: null });
  }

  async pause(ad: PlatformAd) {
    this.calls.push({ method: 'pause', ref: ad.ref, args: null });
  }

  async setDailyBudget(ad: PlatformAd, dailyBudgetVnd: number) {
    this.calls.push({ method: 'setDailyBudget', ref: ad.ref, args: dailyBudgetVnd });
  }

  async setObjective(ad: PlatformAd, objective: 'traffic' | 'conversions'): Promise<void> {
    this.calls.push({ method: 'setObjective', ref: ad.ref, args: objective });
  }

  // A day's spend is 70-100% of the daily budget on each day the ad ran (never more than its total).
  async insights(ad: AdRun, since: string, until: string): Promise<AdInsight[]> {
    if (!ad.activatedAt) return [];
    const first = vnDate(ad.activatedAt);
    const last = vnDate(ad.endsAt);
    let left = ad.totalBudgetVnd;
    const rows: AdInsight[] = [];
    for (const date of daysBetween(first, until)) {
      if (date > last) break;
      const spend = Math.min(
        Math.round((ad.dailyBudgetVnd * (0.7 + (0.3 * roll(ad.ref, date)) / 1000)) / 1000) * 1000,
        left,
      );
      left -= spend;
      if (date < since) continue;
      const clicks = Math.floor(spend / (3_000 + roll(ad.ref, date, 'cpc') * 3));
      const conversions = Math.round(clicks * (0.02 + roll(ad.ref, date, 'cvr') / 50_000));
      rows.push({
        date,
        impressions: clicks * 40,
        clicks,
        spendVnd: spend,
        conversions,
        conversionValueVnd: conversions * AVERAGE_ORDER_VND,
      });
    }
    return rows;
  }
}

export class FakeFacebookPage implements FacebookPageClient {
  readonly mode = 'fake' as const;
  readonly calls: { method: string; args: unknown }[] = [];
  private static counter = 0;

  async publish(post: PagePost) {
    this.calls.push({ method: 'publish', args: post });
    FakeFacebookPage.counter += 1;
    return { externalId: `fake-post-${Date.now()}-${FakeFacebookPage.counter}` };
  }

  async remove(externalId: string) {
    this.calls.push({ method: 'remove', args: externalId });
  }

  // Views fall by half each day after the post; the totals add up the days so far.
  async totals(externalId: string, publishedAt: Date, now: Date): Promise<PostTotals> {
    const first = vnDate(publishedAt);
    const views = daysBetween(first, vnDate(now))
      .map(
        (date) => (300 + roll(externalId) * 1.2) / 2 ** Math.round((Date.parse(date) - Date.parse(first)) / 86_400_000),
      )
      .reduce((sum, value) => sum + value, 0);
    return {
      impressions: Math.round(views),
      reach: Math.round(views * 0.7),
      engagements: Math.round(views * 0.03),
      clicks: Math.round(views * 0.01),
    };
  }
}
