import { errors, enums, toMicros } from 'google-ads-api';
import { GoogleAdsClient } from '../../src/core/server/services/marketing/platforms/GoogleAdsClient';
import { PlatformError } from '../../src/core/server/services/marketing/platforms';
import { sampleAd } from './support/platforms';

// GoogleAdsClient's calls into google-ads-api 25.x (gRPC: nock cannot see it, so the library's customer is mocked).
const mockCustomer = {
  mutateResources: jest.fn(),
  campaigns: { update: jest.fn() },
  campaignBudgets: { update: jest.fn() },
  query: jest.fn(),
};
jest.mock('google-ads-api', () => {
  const actual = jest.requireActual('google-ads-api');
  return {
    ...actual,
    GoogleAdsApi: jest.fn().mockImplementation(() => ({ Customer: () => mockCustomer })),
  };
});

describe('Google Ads request mapping', () => {
  const client = new GoogleAdsClient({
    clientId: 'id',
    clientSecret: 'secret',
    developerToken: 'dev',
    refreshToken: 'refresh',
    customerId: '1234567890',
  });
  afterEach(() => jest.clearAllMocks());

  it('creates budget, paused Search campaign, Vietnam targeting, ad group, keywords and a responsive search ad in one mutate', async () => {
    mockCustomer.mutateResources.mockResolvedValue({
      mutate_operation_responses: [
        { campaign_budget_result: { resource_name: 'customers/1234567890/campaignBudgets/55' } },
        { campaign_result: { resource_name: 'customers/1234567890/campaigns/77' } },
        { campaign_criterion_result: { resource_name: 'customers/1234567890/campaignCriteria/77~1' } },
        { ad_group_result: { resource_name: 'customers/1234567890/adGroups/88' } },
      ],
    });
    const ad = sampleAd({ ref: 'ad-google-1' });
    const created = await client.createPaused(ad);
    expect(created).toEqual({
      externalId: '77',
      platformData: {
        campaign: 'customers/1234567890/campaigns/77',
        budget: 'customers/1234567890/campaignBudgets/55',
        ad_group: 'customers/1234567890/adGroups/88',
      },
    });
    const [operations] = mockCustomer.mutateResources.mock.calls[0];
    expect(operations.map((op: { entity: string }) => op.entity)).toEqual([
      'campaign_budget',
      'campaign',
      'campaign_criterion',
      'ad_group',
      'ad_group_criterion',
      'ad_group_criterion',
      'ad_group_ad',
    ]);
    const [budget, campaign, geo, group, keyword, , rsa] = operations.map((op: { resource: unknown }) => op.resource);
    expect(budget).toMatchObject({
      resource_name: 'customers/1234567890/campaignBudgets/-1',
      amount_micros: toMicros(200000),
      delivery_method: enums.BudgetDeliveryMethod.STANDARD,
    });
    expect(campaign).toMatchObject({
      resource_name: 'customers/1234567890/campaigns/-2',
      advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
      status: enums.CampaignStatus.PAUSED,
      campaign_budget: 'customers/1234567890/campaignBudgets/-1',
      target_spend: {},
      contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
    });
    // Account time zone: Asia/Ho_Chi_Minh.
    expect(campaign.end_date_time).toBe(
      new Date(ad.endsAt.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
    );
    expect(geo).toEqual({
      campaign: 'customers/1234567890/campaigns/-2',
      location: { geo_target_constant: 'geoTargetConstants/2704' },
    });
    expect(group).toMatchObject({
      campaign: 'customers/1234567890/campaigns/-2',
      type: enums.AdGroupType.SEARCH_STANDARD,
    });
    expect(keyword).toMatchObject({ keyword: { text: 'giày nam', match_type: enums.KeywordMatchType.PHRASE } });
    expect(rsa.ad).toEqual({
      final_urls: [ad.landingUrl],
      responsive_search_ad: {
        headlines: ad.creative.headlines!.map((text) => ({ text })),
        descriptions: ad.creative.descriptions!.map((text) => ({ text })),
      },
    });
  });

  it('switches status, budget and bidding on the campaign, and reads daily metrics with GAQL', async () => {
    const ad = {
      ref: 'ad-google-1',
      externalId: '77',
      platformData: {
        campaign: 'customers/1234567890/campaigns/77',
        budget: 'customers/1234567890/campaignBudgets/55',
      },
    };
    await client.activate(ad);
    await client.pause(ad);
    await client.setDailyBudget(ad, 300000);
    await client.setObjective(ad, 'conversions');
    expect(mockCustomer.campaigns.update.mock.calls.map(([ops]) => ops[0])).toEqual([
      { resource_name: 'customers/1234567890/campaigns/77', status: enums.CampaignStatus.ENABLED },
      { resource_name: 'customers/1234567890/campaigns/77', status: enums.CampaignStatus.PAUSED },
      { resource_name: 'customers/1234567890/campaigns/77', maximize_conversions: {} },
    ]);
    expect(mockCustomer.campaignBudgets.update).toHaveBeenCalledWith([
      { resource_name: 'customers/1234567890/campaignBudgets/55', amount_micros: toMicros(300000) },
    ]);

    mockCustomer.query.mockResolvedValue([
      {
        segments: { date: '2026-09-29' },
        metrics: {
          impressions: 5000,
          clicks: 70,
          cost_micros: 180500000000,
          conversions: 2.4,
          conversions_value: 1300000,
        },
      },
    ]);
    const rows = await client.insights(
      {
        ...ad,
        dailyBudgetVnd: 200000,
        totalBudgetVnd: 1000000,
        activatedAt: new Date(),
        endsAt: new Date(),
        status: 'active',
      },
      '2026-09-29',
      '2026-09-30',
    );
    expect(mockCustomer.query.mock.calls[0][0]).toMatch(
      /campaign\.id = 77 AND segments\.date BETWEEN '2026-09-29' AND '2026-09-30'/,
    );
    expect(rows).toEqual([
      {
        date: '2026-09-29',
        impressions: 5000,
        clicks: 70,
        spendVnd: 180500,
        conversions: 2,
        conversionValueVnd: 1300000,
      },
    ]);
  });

  it('turns a Google Ads failure into a platform error that is not retried', async () => {
    mockCustomer.campaigns.update.mockRejectedValue(
      new errors.GoogleAdsFailure({ errors: [{ message: 'Campaign not found' }] }),
    );
    const error = await client.activate({ ref: 'x', externalId: '77', platformData: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({ retryable: false, message: 'google: Campaign not found' });
    mockCustomer.campaigns.update.mockRejectedValue(Object.assign(new Error('UNAVAILABLE'), { code: 14 }));
    expect(await client.pause({ ref: 'x', externalId: '77', platformData: {} }).catch((e) => e)).toMatchObject({
      retryable: true,
    });
  });
});
