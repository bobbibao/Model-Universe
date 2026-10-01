import { AdAccount, AdSet, Campaign, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { PlatformError, type AdInsight, type AdPlatformClient, type AdRun, type NewAd, type PlatformAd } from './types';

// Meta Ads (Facebook and Instagram) through facebook-nodejs-business-sdk 24.x (META_ADS_MODE=live): a campaign
// (OUTCOME_TRAFFIC, or OUTCOME_SALES for conversions), one ad set (daily budget, Vietnam, the dates), one creative
// (the Page's link post: headline, primary text, the image, the landing link) and one ad. Everything below the
// campaign is active and the campaign is created PAUSED, so activating or pausing the campaign starts or stops it.
// VND has no minor unit: Meta takes VND budgets as they are (docs/MARKETING_LIVE_CHECKLIST.md checks it once).

const PURCHASE_ACTIONS = ['purchase', 'offsite_conversion.fb_pixel_purchase'];

type Insight = {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

export class MetaAdsClient implements AdPlatformClient {
  readonly platform = 'meta' as const;
  readonly mode = 'live' as const;

  constructor(
    accessToken: string,
    private readonly adAccountId: string,
    private readonly pageId: string,
    private readonly pixelId?: string,
  ) {
    FacebookAdsApi.init(accessToken, 'vi_VN', false);
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      // The SDK's FacebookRequestError: `status` is the HTTP status, `response` the Graph API's error object.
      const failure = error as { status?: number; response?: { message?: string; is_transient?: boolean } };
      const status = failure.status ?? 0;
      const message = failure.response?.message ?? (error as Error).message;
      throw new PlatformError('meta', message, status === 0 || status >= 500 || !!failure.response?.is_transient);
    }
  }

  private optimization(objective: NewAd['objective']) {
    if (objective === 'conversions') {
      if (!this.pixelId) throw new PlatformError('meta', 'conversions need NEXT_PUBLIC_META_PIXEL_ID', false);
      return {
        optimization_goal: 'OFFSITE_CONVERSIONS',
        promoted_object: { pixel_id: this.pixelId, custom_event_type: 'PURCHASE' },
      };
    }
    return { optimization_goal: 'LINK_CLICKS' };
  }

  async createPaused(ad: NewAd) {
    const optimization = this.optimization(ad.objective); // before any call: a refusal leaves nothing behind
    const account = new AdAccount(`act_${this.adAccountId}`);
    const campaign = await this.call(() =>
      account.createCampaign([], {
        name: ad.name,
        objective: ad.objective === 'conversions' ? 'OUTCOME_SALES' : 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        special_ad_categories: [],
      }),
    );
    const adSet = await this.call(() =>
      account.createAdSet([], {
        name: ad.name,
        campaign_id: campaign.id,
        daily_budget: ad.dailyBudgetVnd,
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: { geo_locations: { countries: ['VN'] } },
        start_time: ad.startsAt.toISOString(),
        end_time: ad.endsAt.toISOString(),
        status: 'ACTIVE',
        ...optimization,
      }),
    );
    const creative = await this.call(() =>
      account.createAdCreative([], {
        name: ad.name,
        object_story_spec: {
          page_id: this.pageId,
          link_data: {
            link: ad.landingUrl,
            message: ad.creative.primary_text ?? '',
            name: ad.creative.headline ?? '',
            ...(ad.creative.imageUrl ? { picture: ad.creative.imageUrl } : {}),
            call_to_action: { type: 'SHOP_NOW', value: { link: ad.landingUrl } },
          },
        },
      }),
    );
    const created = await this.call(() =>
      account.createAd([], {
        name: ad.name,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: 'ACTIVE',
      }),
    );
    return {
      externalId: campaign.id,
      platformData: { adset_id: adSet.id, creative_id: creative.id, ad_id: created.id },
    };
  }

  async activate(ad: PlatformAd) {
    await this.call(() => new Campaign(ad.externalId).update([], { status: 'ACTIVE' }));
  }

  async pause(ad: PlatformAd) {
    await this.call(() => new Campaign(ad.externalId).update([], { status: 'PAUSED' }));
  }

  async setDailyBudget(ad: PlatformAd, dailyBudgetVnd: number) {
    await this.call(() => new AdSet(ad.platformData.adset_id).update([], { daily_budget: dailyBudgetVnd }));
  }

  // A campaign's objective cannot change: the old campaign is paused and a new one with the same ad replaces it.
  async setObjective(ad: PlatformAd, objective: 'traffic' | 'conversions', spec: NewAd): Promise<PlatformAd> {
    await this.pause(ad);
    const replacement = await this.createPaused({ ...spec, objective });
    return { ref: ad.ref, ...replacement };
  }

  async insights(ad: AdRun, since: string, until: string): Promise<AdInsight[]> {
    const rows: Insight[] = [];
    let cursor = await this.call(async () =>
      new Campaign(ad.externalId).getInsights(['spend', 'impressions', 'clicks', 'actions', 'action_values'], {
        time_range: { since, until },
        time_increment: 1,
      }),
    );
    rows.push(...cursor.map((row) => row as Insight));
    while (cursor.hasNext()) {
      const current = cursor;
      cursor = await this.call(async () => current.next());
      rows.push(...cursor.map((row) => row as Insight));
    }
    const purchase = (list?: { action_type: string; value: string }[]) =>
      Number(list?.find((item) => PURCHASE_ACTIONS.includes(item.action_type))?.value ?? 0);
    return rows.map((row) => ({
      date: row.date_start,
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      spendVnd: Math.round(Number(row.spend ?? 0)),
      conversions: Math.round(purchase(row.actions)),
      conversionValueVnd: Math.round(purchase(row.action_values)),
    }));
  }
}
