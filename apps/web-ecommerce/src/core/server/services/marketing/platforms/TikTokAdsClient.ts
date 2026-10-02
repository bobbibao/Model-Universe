import axios, { AxiosError, type AxiosInstance } from 'axios';
import { PlatformError, type AdInsight, type AdPlatformClient, type AdRun, type NewAd, type PlatformAd } from './types';

// TikTok Ads through the Business API v1.3 (TIKTOK_ADS_MODE=live): a campaign (TRAFFIC, or WEB_CONVERSIONS for
// conversions; created disabled), one ad group (daily budget, Vietnam, the dates; CLICK, or the pixel's
// COMPLETE_PAYMENT) and one single-video ad. TikTok has no image ads: the staff-uploaded video is uploaded by URL and
// its cover becomes the ad's image. Every response is `{code, message, data}`; code 0 is success. Amounts are the
// advertiser's currency (VND, whole). docs/MARKETING_LIVE_CHECKLIST.md lists what to confirm before going live.

const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';
const VIETNAM = '1562822'; // location id
const RETRYABLE_CODES = new Set([40100, 50000, 50002]); // rate limited, system errors

type Envelope<T> = { code: number; message: string; data: T };
type ReportRow = { dimensions: { stat_time_day: string }; metrics: Record<string, string> };

export interface TikTokCredentials {
  accessToken: string;
  advertiserId: string;
  identityId: string; // a custom identity (name and avatar shown on the ad)
  pixelId?: string;
}

// "YYYY-MM-DD HH:MM:SS" in UTC (the API's schedule times are UTC+0).
const utc = (instant: Date) => instant.toISOString().slice(0, 19).replace('T', ' ');

export class TikTokAdsClient implements AdPlatformClient {
  readonly platform = 'tiktok' as const;
  readonly mode = 'live' as const;
  private readonly http: AxiosInstance;

  constructor(private readonly credentials: TikTokCredentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30_000,
      headers: { 'Access-Token': credentials.accessToken, 'Content-Type': 'application/json' },
    });
  }

  private async call<T>(request: () => Promise<{ data: Envelope<T> }>): Promise<T> {
    let envelope: Envelope<T>;
    try {
      envelope = (await request()).data;
    } catch (error) {
      const status = (error as AxiosError).response?.status ?? 0;
      throw new PlatformError('tiktok', (error as Error).message, status === 0 || status === 429 || status >= 500);
    }
    if (envelope.code !== 0) throw new PlatformError('tiktok', envelope.message, RETRYABLE_CODES.has(envelope.code));
    return envelope.data;
  }

  private post<T>(path: string, body: Record<string, unknown>) {
    return this.call<T>(() => this.http.post(path, { advertiser_id: this.credentials.advertiserId, ...body }));
  }

  private optimization(objective: NewAd['objective']) {
    if (objective === 'conversions') {
      if (!this.credentials.pixelId)
        throw new PlatformError('tiktok', 'conversions need NEXT_PUBLIC_TIKTOK_PIXEL_ID', false);
      return {
        optimization_goal: 'CONVERT',
        optimization_event: 'COMPLETE_PAYMENT',
        pixel_id: this.credentials.pixelId,
        billing_event: 'OCPM',
      };
    }
    return { optimization_goal: 'CLICK', billing_event: 'CPC' };
  }

  // The video by URL, then its cover as the ad's image.
  private async uploadVideo(ad: NewAd) {
    const url = ad.creative.videoUrl;
    if (!url) throw new PlatformError('tiktok', 'a TikTok ad needs a video asset', false);
    const [video] = await this.post<{ video_id: string; video_cover_url: string }[]>('/file/video/ad/upload/', {
      upload_type: 'UPLOAD_BY_URL',
      video_url: url,
      file_name: `${ad.ref}.mp4`,
    });
    const cover = await this.post<{ image_id: string }>('/file/image/ad/upload/', {
      upload_type: 'UPLOAD_BY_URL',
      image_url: video.video_cover_url,
      file_name: `${ad.ref}-cover.jpg`,
    });
    return { videoId: video.video_id, imageId: cover.image_id };
  }

  async createPaused(ad: NewAd) {
    const optimization = this.optimization(ad.objective); // before any call: a refusal leaves nothing behind
    const media = await this.uploadVideo(ad);
    const { campaign_id: campaignId } = await this.post<{ campaign_id: string }>('/campaign/create/', {
      campaign_name: ad.name,
      objective_type: ad.objective === 'conversions' ? 'WEB_CONVERSIONS' : 'TRAFFIC',
      budget_mode: 'BUDGET_MODE_INFINITE',
      operation_status: 'DISABLE',
    });
    const { adgroup_id: adGroupId } = await this.post<{ adgroup_id: string }>('/adgroup/create/', {
      campaign_id: campaignId,
      adgroup_name: ad.name,
      promotion_type: 'WEBSITE',
      placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
      location_ids: [VIETNAM],
      budget_mode: 'BUDGET_MODE_DAY',
      budget: ad.dailyBudgetVnd,
      schedule_type: 'SCHEDULE_START_END',
      schedule_start_time: utc(new Date(Math.max(ad.startsAt.getTime(), Date.now()))),
      schedule_end_time: utc(ad.endsAt),
      bid_type: 'BID_TYPE_NO_BID',
      pacing: 'PACING_MODE_SMOOTH',
      ...optimization,
    });
    const { ad_ids: adIds } = await this.post<{ ad_ids: string[] }>('/ad/create/', {
      adgroup_id: adGroupId,
      creatives: [
        {
          ad_name: ad.name,
          ad_format: 'SINGLE_VIDEO',
          identity_type: 'CUSTOMIZED_USER',
          identity_id: this.credentials.identityId,
          video_id: media.videoId,
          image_ids: [media.imageId],
          ad_text: ad.creative.ad_text ?? '',
          call_to_action: 'SHOP_NOW',
          landing_page_url: ad.landingUrl,
        },
      ],
    });
    return {
      externalId: campaignId,
      platformData: { adgroup_id: adGroupId, ad_id: adIds[0] ?? '', video_id: media.videoId },
    };
  }

  private status(ad: PlatformAd, status: 'ENABLE' | 'DISABLE') {
    return this.post('/campaign/status/update/', { campaign_ids: [ad.externalId], operation_status: status });
  }

  async activate(ad: PlatformAd) {
    await this.status(ad, 'ENABLE');
  }

  async pause(ad: PlatformAd) {
    await this.status(ad, 'DISABLE');
  }

  async setDailyBudget(ad: PlatformAd, dailyBudgetVnd: number) {
    await this.post('/adgroup/budget/update/', {
      budget: [{ adgroup_id: ad.platformData.adgroup_id, budget: dailyBudgetVnd }],
    });
  }

  // A campaign's objective cannot change: the old campaign is disabled and a new one with the same ad replaces it.
  async setObjective(ad: PlatformAd, objective: 'traffic' | 'conversions', spec: NewAd): Promise<PlatformAd> {
    await this.pause(ad);
    const replacement = await this.createPaused({ ...spec, objective });
    return { ref: ad.ref, ...replacement };
  }

  async insights(ad: AdRun, since: string, until: string): Promise<AdInsight[]> {
    const data = await this.call<{ list: ReportRow[] }>(() =>
      this.http.get('/report/integrated/get/', {
        params: {
          advertiser_id: this.credentials.advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
          metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'complete_payment', 'complete_payment_roas']),
          start_date: since,
          end_date: until,
          filtering: JSON.stringify([
            { field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([ad.externalId]) },
          ]),
          page_size: 1000,
        },
      }),
    );
    return data.list.map((row) => {
      const spend = Math.round(Number(row.metrics.spend ?? 0));
      return {
        date: row.dimensions.stat_time_day.slice(0, 10),
        impressions: Number(row.metrics.impressions ?? 0),
        clicks: Number(row.metrics.clicks ?? 0),
        spendVnd: spend,
        conversions: Math.round(Number(row.metrics.complete_payment ?? 0)),
        conversionValueVnd: Math.round(spend * Number(row.metrics.complete_payment_roas ?? 0)),
      };
    });
  }
}
