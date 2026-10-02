import {
  enums,
  errors,
  fromMicros,
  GoogleAdsApi,
  ResourceNames,
  toMicros,
  type Customer,
  type MutateOperation,
  type resources,
} from 'google-ads-api';
import { PlatformError, type AdInsight, type AdPlatformClient, type AdRun, type NewAd, type PlatformAd } from './types';

// Google Ads through google-ads-api 25.x (API v25, gRPC; GOOGLE_ADS_MODE=live). One atomic mutate creates a daily
// budget, a PAUSED Search campaign (Maximize Clicks, or Maximize Conversions for conversions) targeting Vietnam, one
// ad group, its phrase-match keywords and one responsive search ad. Activating and pausing switch the campaign's
// status. Amounts are micros of the account currency: VND x 1,000,000. Dates are the account's time zone
// (Asia/Ho_Chi_Minh, set when the account was created).

const VIETNAM = 2704; // geoTargetConstants/2704
const VN_OFFSET_MS = 7 * 3600_000;
// gRPC codes worth retrying: DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, ABORTED, INTERNAL, UNAVAILABLE.
const RETRYABLE_GRPC = new Set([4, 8, 10, 13, 14]);

export interface GoogleAdsCredentials {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
}

// A Google Ads failure (not retryable) or a gRPC error (retryable when transient) as a PlatformError.
export const callGoogle = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request();
  } catch (error) {
    if (error instanceof errors.GoogleAdsFailure) {
      const message = (error.errors ?? []).map((e) => e.message).join('; ') || 'request failed';
      throw new PlatformError('google', message, false);
    }
    const code = (error as { code?: number }).code;
    throw new PlatformError('google', (error as Error).message, code === undefined || RETRYABLE_GRPC.has(code));
  }
};

// "yyyy-MM-dd HH:mm:ss" in Vietnam.
export const vnDateTime = (instant: Date) =>
  new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');

// A customer (the ad account) of the Google Ads API; also used for offline conversion uploads.
export const googleCustomer = (credentials: GoogleAdsCredentials): Customer =>
  new GoogleAdsApi({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    developer_token: credentials.developerToken,
  }).Customer({
    customer_id: credentials.customerId,
    refresh_token: credentials.refreshToken,
    ...(credentials.loginCustomerId ? { login_customer_id: credentials.loginCustomerId } : {}),
  });

const bidding = (objective: NewAd['objective']) =>
  objective === 'conversions' ? { maximize_conversions: {} } : { target_spend: {} };

export class GoogleAdsClient implements AdPlatformClient {
  readonly platform = 'google' as const;
  readonly mode = 'live' as const;
  private readonly customer: Customer;
  private readonly customerId: string;

  constructor(credentials: GoogleAdsCredentials) {
    this.customerId = credentials.customerId;
    this.customer = googleCustomer(credentials);
  }

  private call<T>(request: () => Promise<T>): Promise<T> {
    return callGoogle(request);
  }

  async createPaused(ad: NewAd) {
    const cid = this.customerId;
    const budget = ResourceNames.campaignBudget(cid, '-1');
    const campaign = ResourceNames.campaign(cid, '-2');
    const adGroup = ResourceNames.adGroup(cid, '-3');
    // A start in the past (or now) is refused: leave it out and the campaign starts when it is enabled.
    const start = ad.startsAt.getTime() > Date.now() + 60_000 ? { start_date_time: vnDateTime(ad.startsAt) } : {};
    const creative = ad.creative;
    const operations: MutateOperation<
      | resources.ICampaignBudget
      | resources.ICampaign
      | resources.ICampaignCriterion
      | resources.IAdGroup
      | resources.IAdGroupCriterion
      | resources.IAdGroupAd
    >[] = [
      {
        entity: 'campaign_budget',
        operation: 'create',
        resource: {
          resource_name: budget,
          name: `${ad.ref} budget`,
          delivery_method: enums.BudgetDeliveryMethod.STANDARD,
          amount_micros: toMicros(ad.dailyBudgetVnd),
          explicitly_shared: false,
        },
      },
      {
        entity: 'campaign',
        operation: 'create',
        resource: {
          resource_name: campaign,
          name: ad.name,
          advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
          status: enums.CampaignStatus.PAUSED,
          campaign_budget: budget,
          ...bidding(ad.objective),
          network_settings: { target_google_search: true, target_search_network: false, target_content_network: false },
          contains_eu_political_advertising:
            enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
          ...start,
          end_date_time: vnDateTime(ad.endsAt),
        },
      },
      {
        entity: 'campaign_criterion',
        operation: 'create',
        resource: { campaign, location: { geo_target_constant: ResourceNames.geoTargetConstant(VIETNAM) } },
      },
      {
        entity: 'ad_group',
        operation: 'create',
        resource: {
          resource_name: adGroup,
          name: ad.name,
          campaign,
          type: enums.AdGroupType.SEARCH_STANDARD,
          status: enums.AdGroupStatus.ENABLED,
        },
      },
      ...(creative.keywords ?? []).map((text) => ({
        entity: 'ad_group_criterion' as const,
        operation: 'create' as const,
        resource: {
          ad_group: adGroup,
          status: enums.AdGroupCriterionStatus.ENABLED,
          keyword: { text, match_type: enums.KeywordMatchType.PHRASE },
        },
      })),
      {
        entity: 'ad_group_ad',
        operation: 'create',
        resource: {
          ad_group: adGroup,
          status: enums.AdGroupAdStatus.ENABLED,
          ad: {
            final_urls: [ad.landingUrl],
            responsive_search_ad: {
              headlines: (creative.headlines ?? []).map((text) => ({ text })),
              descriptions: (creative.descriptions ?? []).map((text) => ({ text })),
            },
          },
        },
      },
    ];
    const response = await this.call(() => this.customer.mutateResources(operations));
    const results = response.mutate_operation_responses ?? [];
    const name = (pick: (r: (typeof results)[number]) => string | null | undefined) =>
      results.map(pick).find((value): value is string => !!value) ?? '';
    const campaignName = name((r) => r.campaign_result?.resource_name);
    return {
      externalId: campaignName.split('/').pop() ?? '',
      platformData: {
        campaign: campaignName,
        budget: name((r) => r.campaign_budget_result?.resource_name),
        ad_group: name((r) => r.ad_group_result?.resource_name),
      },
    };
  }

  private campaignName(ad: PlatformAd) {
    return ad.platformData.campaign ?? ResourceNames.campaign(this.customerId, ad.externalId);
  }

  async activate(ad: PlatformAd) {
    await this.call(() =>
      this.customer.campaigns.update([{ resource_name: this.campaignName(ad), status: enums.CampaignStatus.ENABLED }]),
    );
  }

  async pause(ad: PlatformAd) {
    await this.call(() =>
      this.customer.campaigns.update([{ resource_name: this.campaignName(ad), status: enums.CampaignStatus.PAUSED }]),
    );
  }

  async setDailyBudget(ad: PlatformAd, dailyBudgetVnd: number) {
    await this.call(() =>
      this.customer.campaignBudgets.update([
        { resource_name: ad.platformData.budget, amount_micros: toMicros(dailyBudgetVnd) },
      ]),
    );
  }

  // Google switches a campaign's bid strategy in place (the update mask names the new strategy).
  async setObjective(ad: PlatformAd, objective: 'traffic' | 'conversions'): Promise<void> {
    await this.call(() =>
      this.customer.campaigns.update([{ resource_name: this.campaignName(ad), ...bidding(objective) }]),
    );
  }

  async insights(ad: AdRun, since: string, until: string): Promise<AdInsight[]> {
    const id = Number(ad.externalId);
    if (!Number.isInteger(id)) throw new PlatformError('google', `campaign id ${ad.externalId} is not a number`, false);
    if (![since, until].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))) throw new Error('dates are YYYY-MM-DD');
    const rows = await this.call(() =>
      this.customer.query(`
        SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.conversions_value
        FROM campaign
        WHERE campaign.id = ${id} AND segments.date BETWEEN '${since}' AND '${until}'`),
    );
    return rows.map((row) => ({
      date: String(row.segments?.date ?? ''),
      impressions: Number(row.metrics?.impressions ?? 0),
      clicks: Number(row.metrics?.clicks ?? 0),
      spendVnd: Math.round(fromMicros(Number(row.metrics?.cost_micros ?? 0))),
      conversions: Math.round(Number(row.metrics?.conversions ?? 0)),
      conversionValueVnd: Math.round(Number(row.metrics?.conversions_value ?? 0)),
    }));
  }
}
