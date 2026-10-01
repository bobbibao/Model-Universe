import nock from 'nock';
import { MetaAdsClient } from '../../src/core/server/services/marketing/platforms/MetaAdsClient';
import { PlatformError } from '../../src/core/server/services/marketing/platforms';
import { sampleAd } from './support/platforms';

// MetaAdsClient's requests to the Graph API (facebook-nodejs-business-sdk 24.x), offline: nock answers, the network
// is closed. Live behaviour is checked once with docs/MARKETING_LIVE_CHECKLIST.md.
describe('Meta Ads request mapping', () => {
  const graph = () => nock('https://graph.facebook.com/v24.0');
  beforeAll(() => nock.disableNetConnect());
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  it('creates a paused campaign, an ad set (VND budget, Vietnam), a link creative and the ad', async () => {
    const bodies: Record<string, Record<string, any>> = {};
    const capture = (name: string) => (body: Record<string, any>) => {
      bodies[name] = body;
      return true;
    };
    const token = { access_token: 'meta-token' };
    graph().post('/act_111/campaigns', capture('campaign')).query(token).reply(200, { id: 'c1' });
    graph().post('/act_111/adsets', capture('adset')).query(token).reply(200, { id: 'as1' });
    graph().post('/act_111/adcreatives', capture('creative')).query(token).reply(200, { id: 'cr1' });
    graph().post('/act_111/ads', capture('ad')).query(token).reply(200, { id: 'ad1' });

    const ad = sampleAd();
    const created = await new MetaAdsClient('meta-token', '111', 'page-1').createPaused(ad);
    expect(created).toEqual({ externalId: 'c1', platformData: { adset_id: 'as1', creative_id: 'cr1', ad_id: 'ad1' } });
    expect(bodies.campaign).toMatchObject({
      name: ad.name,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
    });
    expect(bodies.adset).toMatchObject({
      campaign_id: 'c1',
      daily_budget: 200000,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      targeting: { geo_locations: { countries: ['VN'] } },
      start_time: ad.startsAt.toISOString(),
      end_time: ad.endsAt.toISOString(),
      status: 'ACTIVE',
    });
    expect(bodies.creative.object_story_spec).toEqual({
      page_id: 'page-1',
      link_data: {
        link: ad.landingUrl,
        message: 'Êm chân cả ngày.',
        name: 'Giày mới mùa thu',
        picture: 'https://shop.example.vn/uploads/shoe.jpg',
        call_to_action: { type: 'SHOP_NOW', value: { link: ad.landingUrl } },
      },
    });
    expect(bodies.ad).toMatchObject({ adset_id: 'as1', creative: { creative_id: 'cr1' }, status: 'ACTIVE' });
  });

  it('optimises for purchases on the pixel, and refuses conversions without one', async () => {
    let adset: Record<string, any> = {};
    graph()
      .post('/act_111/campaigns', (body) => body.objective === 'OUTCOME_SALES')
      .query(true)
      .reply(200, { id: 'c2' });
    graph()
      .post('/act_111/adsets', (body) => {
        adset = body;
        return true;
      })
      .query(true)
      .reply(200, { id: 'as2' });
    graph().post('/act_111/adcreatives').query(true).reply(200, { id: 'cr2' });
    graph().post('/act_111/ads').query(true).reply(200, { id: 'ad2' });
    await new MetaAdsClient('meta-token', '111', 'page-1', 'pixel-9').createPaused(
      sampleAd({ objective: 'conversions' }),
    );
    expect(adset).toMatchObject({
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: { pixel_id: 'pixel-9', custom_event_type: 'PURCHASE' },
    });
    await expect(
      new MetaAdsClient('meta-token', '111', 'page-1').createPaused(sampleAd({ objective: 'conversions' })),
    ).rejects.toThrow(PlatformError);
  });

  it('activates and pauses the campaign, changes the ad set budget, and reads daily insights', async () => {
    const client = new MetaAdsClient('meta-token', '111', 'page-1');
    const ad = { ref: 'ad-meta-1', externalId: 'c1', platformData: { adset_id: 'as1' } };
    graph()
      .post('/c1', (body) => body.status === 'ACTIVE')
      .query(true)
      .reply(200, { success: true });
    graph()
      .post('/c1', (body) => body.status === 'PAUSED')
      .query(true)
      .reply(200, { success: true });
    graph()
      .post('/as1', (body) => body.daily_budget === 300000)
      .query(true)
      .reply(200, { success: true });
    await client.activate(ad);
    await client.pause(ad);
    await client.setDailyBudget(ad, 300000);

    graph()
      .get('/c1/insights')
      .query((query) => query.time_increment === '1' && JSON.parse(String(query.time_range)).since === '2026-09-29')
      .reply(200, {
        data: [
          {
            date_start: '2026-09-29',
            spend: '183456.4',
            impressions: '9000',
            clicks: '61',
            actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }],
            action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '1250000' }],
          },
          { date_start: '2026-09-30', spend: '0', impressions: '0', clicks: '0' },
        ],
      });
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
    expect(rows).toEqual([
      {
        date: '2026-09-29',
        impressions: 9000,
        clicks: 61,
        spendVnd: 183456,
        conversions: 2,
        conversionValueVnd: 1250000,
      },
      { date: '2026-09-30', impressions: 0, clicks: 0, spendVnd: 0, conversions: 0, conversionValueVnd: 0 },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it('replaces the campaign to switch the objective (it cannot change in place)', async () => {
    graph()
      .post('/c1', (body) => body.status === 'PAUSED')
      .query(true)
      .reply(200, { success: true });
    graph()
      .post('/act_111/campaigns', (body) => body.objective === 'OUTCOME_SALES')
      .query(true)
      .reply(200, { id: 'c9' });
    graph().post('/act_111/adsets').query(true).reply(200, { id: 'as9' });
    graph().post('/act_111/adcreatives').query(true).reply(200, { id: 'cr9' });
    graph().post('/act_111/ads').query(true).reply(200, { id: 'ad9' });
    const replaced = await new MetaAdsClient('meta-token', '111', 'page-1', 'pixel-9').setObjective(
      { ref: 'ad-meta-1', externalId: 'c1', platformData: {} },
      'conversions',
      sampleAd(),
    );
    expect(replaced).toEqual({
      ref: 'ad-meta-1',
      externalId: 'c9',
      platformData: { adset_id: 'as9', creative_id: 'cr9', ad_id: 'ad9' },
    });
  });

  it('turns Graph API errors into platform errors (retryable when transient or 5xx)', async () => {
    const client = new MetaAdsClient('meta-token', '111', 'page-1');
    const ad = { ref: 'x', externalId: 'c1', platformData: {} };
    graph()
      .post('/c1')
      .query(true)
      .reply(400, { error: { message: 'Invalid parameter', is_transient: false } });
    const refused = await client.activate(ad).catch((error) => error);
    expect(refused).toBeInstanceOf(PlatformError);
    expect(refused).toMatchObject({ code: 'platform_error', statusCode: 502, retryable: false });
    expect(refused.message).toMatch(/meta: Invalid parameter/);

    graph()
      .post('/c1')
      .query(true)
      .reply(500, { error: { message: 'Service temporarily unavailable', is_transient: true } });
    expect(await client.activate(ad).catch((error) => error)).toMatchObject({ retryable: true });
  });
});
