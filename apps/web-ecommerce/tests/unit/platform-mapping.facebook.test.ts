import nock from 'nock';
import { FacebookGraphPage, POST_METRICS } from '../../src/core/server/services/marketing/platforms/FacebookGraphPage';
import { PlatformError } from '../../src/core/server/services/marketing/platforms';

// FacebookGraphPage's requests to the Graph API, offline (nock; the network is closed).
describe('Facebook Page request mapping', () => {
  const graph = () => nock('https://graph.facebook.com/v24.0');
  const page = new FacebookGraphPage('page-1', 'page-token');
  beforeAll(() => nock.disableNetConnect());
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  it('publishes a photo post with the link in the caption, and a link post without an image', async () => {
    let photo: Record<string, unknown> = {};
    graph()
      .post('/page-1/photos', (body) => {
        photo = body;
        return true;
      })
      .reply(200, { id: 'photo-1', post_id: 'page-1_111' });
    const withImage = await page.publish({
      message: 'Bộ sưu tập mới',
      link: 'https://shop.example.vn/p?utm_source=facebook',
      imageUrl: 'https://shop.example.vn/uploads/a.jpg',
    });
    expect(withImage).toEqual({ externalId: 'page-1_111' });
    expect(photo).toEqual({
      url: 'https://shop.example.vn/uploads/a.jpg',
      caption: 'Bộ sưu tập mới\nhttps://shop.example.vn/p?utm_source=facebook',
      access_token: 'page-token',
    });

    let feed: Record<string, unknown> = {};
    graph()
      .post('/page-1/feed', (body) => {
        feed = body;
        return true;
      })
      .reply(200, { id: 'page-1_222' });
    const at = new Date('2026-10-05T02:00:00Z');
    expect(await page.publish({ message: 'Hẹn gặp', link: 'https://shop.example.vn/', scheduledAt: at })).toEqual({
      externalId: 'page-1_222',
    });
    expect(feed).toEqual({
      message: 'Hẹn gặp',
      link: 'https://shop.example.vn/',
      published: false,
      scheduled_publish_time: Math.floor(at.getTime() / 1000),
      access_token: 'page-token',
    });
  });

  it('deletes a post and reads its lifetime totals', async () => {
    graph().delete('/page-1_111').query({ access_token: 'page-token' }).reply(200, { success: true });
    await page.remove('page-1_111');

    graph()
      .get('/page-1_111')
      .query((query) => String(query.fields).includes(`insights.metric(${POST_METRICS.join(',')})`))
      .reply(200, {
        reactions: { summary: { total_count: 12 } },
        comments: { summary: { total_count: 3 } },
        shares: { count: 2 },
        insights: {
          data: [
            { name: 'post_media_view', values: [{ value: 1500 }] },
            { name: 'post_total_media_view_unique', values: [{ value: 1100 }] },
            { name: 'post_clicks', values: [{ value: 40 }] },
          ],
        },
      });
    expect(await page.totals('page-1_111')).toEqual({
      impressions: 1500,
      reach: 1100,
      clicks: 40,
      engagements: 17,
    });
  });

  it('reports refusals as platform errors', async () => {
    graph()
      .post('/page-1/feed')
      .reply(403, { error: { message: '(#200) Permissions error' } });
    const error = await page.publish({ message: 'x' }).catch((e) => e);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({ code: 'platform_error', retryable: false });
  });
});
