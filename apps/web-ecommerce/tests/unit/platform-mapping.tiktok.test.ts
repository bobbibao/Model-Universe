import nock from 'nock';
import { TikTokAdsClient } from '../../src/core/server/services/marketing/platforms/TikTokAdsClient';
import { PlatformError } from '../../src/core/server/services/marketing/platforms';
import { sampleAd } from './support/platforms';

// TikTokAdsClient's requests to the Business API v1.3, offline (nock; the network is closed).
describe('TikTok Ads request mapping', () => {
  const api = () => nock('https://business-api.tiktok.com/open_api/v1.3').matchHeader('Access-Token', 'tt-token');
  const ok = (data: unknown) => ({ code: 0, message: 'OK', data });
  const client = new TikTokAdsClient({ accessToken: 'tt-token', advertiserId: '700', identityId: 'id-1' });
  beforeAll(() => nock.disableNetConnect());
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  it('uploads the video and its cover, then creates a disabled campaign, the ad group and the video ad', async () => {
    const bodies: Record<string, Record<string, any>> = {};
    const capture = (name: string) => (body: Record<string, any>) => {
      bodies[name] = body;
      return true;
    };
    api()
      .post('/file/video/ad/upload/', capture('video'))
      .reply(200, ok([{ video_id: 'v1', video_cover_url: 'https://cdn.example/cover.jpg' }]));
    api()
      .post('/file/image/ad/upload/', capture('image'))
      .reply(200, ok({ image_id: 'i1' }));
    api()
      .post('/campaign/create/', capture('campaign'))
      .reply(200, ok({ campaign_id: 'tc1' }));
    api()
      .post('/adgroup/create/', capture('adgroup'))
      .reply(200, ok({ adgroup_id: 'tg1' }));
    api()
      .post('/ad/create/', capture('ad'))
      .reply(200, ok({ ad_ids: ['ta1'] }));

    const ad = sampleAd({ ref: 'ad-tiktok-1' });
    const created = await client.createPaused(ad);
    expect(created).toEqual({ externalId: 'tc1', platformData: { adgroup_id: 'tg1', ad_id: 'ta1', video_id: 'v1' } });
    expect(bodies.video).toEqual({
      advertiser_id: '700',
      upload_type: 'UPLOAD_BY_URL',
      video_url: 'https://shop.example.vn/uploads/shoe.mp4',
      file_name: 'ad-tiktok-1.mp4',
    });
    expect(bodies.image).toMatchObject({ upload_type: 'UPLOAD_BY_URL', image_url: 'https://cdn.example/cover.jpg' });
    expect(bodies.campaign).toEqual({
      advertiser_id: '700',
      campaign_name: ad.name,
      objective_type: 'TRAFFIC',
      budget_mode: 'BUDGET_MODE_INFINITE',
      operation_status: 'DISABLE',
    });
    expect(bodies.adgroup).toMatchObject({
      campaign_id: 'tc1',
      location_ids: ['1562822'],
      budget_mode: 'BUDGET_MODE_DAY',
      budget: 200000,
      schedule_type: 'SCHEDULE_START_END',
      schedule_start_time: ad.startsAt.toISOString().slice(0, 19).replace('T', ' '),
      schedule_end_time: ad.endsAt.toISOString().slice(0, 19).replace('T', ' '),
      optimization_goal: 'CLICK',
      billing_event: 'CPC',
      promotion_type: 'WEBSITE',
    });
    expect(bodies.ad.creatives).toEqual([
      {
        ad_name: ad.name,
        ad_format: 'SINGLE_VIDEO',
        identity_type: 'CUSTOMIZED_USER',
        identity_id: 'id-1',
        video_id: 'v1',
        image_ids: ['i1'],
        ad_text: 'Giày mới mùa thu',
        call_to_action: 'SHOP_NOW',
        landing_page_url: ad.landingUrl,
      },
    ]);
  });

  it('needs a video', async () => {
    await expect(client.createPaused(sampleAd({ creative: { ad_text: 'x' } }))).rejects.toThrow(/video asset/);
  });

  it('switches the campaign status, the ad group budget, and reads the daily report', async () => {
    const ad = { ref: 'ad-tiktok-1', externalId: 'tc1', platformData: { adgroup_id: 'tg1' } };
    api()
      .post('/campaign/status/update/', { advertiser_id: '700', campaign_ids: ['tc1'], operation_status: 'ENABLE' })
      .reply(200, ok({}));
    api()
      .post('/campaign/status/update/', { advertiser_id: '700', campaign_ids: ['tc1'], operation_status: 'DISABLE' })
      .reply(200, ok({}));
    api()
      .post('/adgroup/budget/update/', { advertiser_id: '700', budget: [{ adgroup_id: 'tg1', budget: 150000 }] })
      .reply(200, ok({}));
    await client.activate(ad);
    await client.pause(ad);
    await client.setDailyBudget(ad, 150000);

    api()
      .get('/report/integrated/get/')
      .query((query) => query.data_level === 'AUCTION_CAMPAIGN' && query.start_date === '2026-09-29')
      .reply(
        200,
        ok({
          list: [
            {
              dimensions: { campaign_id: 'tc1', stat_time_day: '2026-09-29 00:00:00' },
              metrics: {
                spend: '95000.4',
                impressions: '12000',
                clicks: '80',
                complete_payment: '3',
                complete_payment_roas: '4',
              },
            },
          ],
        }),
      );
    const rows = await client.insights(
      {
        ...ad,
        dailyBudgetVnd: 100000,
        totalBudgetVnd: 300000,
        activatedAt: new Date(),
        endsAt: new Date(),
        status: 'active',
      },
      '2026-09-29',
      '2026-09-29',
    );
    expect(rows).toEqual([
      {
        date: '2026-09-29',
        impressions: 12000,
        clicks: 80,
        spendVnd: 95000,
        conversions: 3,
        conversionValueVnd: 380000,
      },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it('turns API codes into platform errors (rate limits are retryable)', async () => {
    const ad = { ref: 'x', externalId: 'tc1', platformData: {} };
    api().post('/campaign/status/update/').reply(200, { code: 40100, message: 'Too many requests', data: {} });
    expect(await client.activate(ad).catch((e) => e)).toMatchObject({ code: 'platform_error', retryable: true });
    api().post('/campaign/status/update/').reply(200, { code: 40002, message: 'Invalid campaign', data: {} });
    const refused = await client.activate(ad).catch((e) => e);
    expect(refused).toBeInstanceOf(PlatformError);
    expect(refused).toMatchObject({ retryable: false, message: 'tiktok: Invalid campaign' });
  });
});
