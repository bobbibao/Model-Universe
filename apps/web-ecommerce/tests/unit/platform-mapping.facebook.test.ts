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
  it('uploads photos unpublished and attaches them to one scheduled post in the selected order', async () => {
    const at = new Date('2026-10-20T02:00:00Z');
    const photos = ['https://shop.example/a.jpg', 'https://shop.example/b.jpg'];
    for (const [index, url] of photos.entries())
      graph()
        .post(
          '/page-1/photos',
          (body) =>
            body.url === url &&
            body.published === false &&
            body.temporary === true &&
            body.unpublished_content_type === 'SCHEDULED',
        )
        .reply(200, { id: `photo-${index}` });
    const feed = graph()
      .post('/page-1/feed', (body) => {
        expect(body.attached_media).toEqual([{ media_fbid: 'photo-0' }, { media_fbid: 'photo-1' }]);
        expect(body.message).toBe('Collection\nhttps://shop.example/collection');
        expect(body.scheduled_publish_time).toBe(Math.floor(at.getTime() / 1000));
        expect(body.published).toBe(false);
        return true;
      })
      .reply(200, { id: 'album-post' });
    expect(
      await page.publish({
        message: 'Collection',
        link: 'https://shop.example/collection',
        imageUrls: photos,
        scheduledAt: at,
      }),
    ).toEqual({ externalId: 'album-post' });
    expect(feed.isDone()).toBe(true);
  });
  it('cleans up unpublished photos when a multi-photo upload fails', async () => {
    graph().post('/page-1/photos').reply(200, { id: 'orphan-photo' });
    graph()
      .post('/page-1/photos')
      .reply(400, { error: { message: 'Invalid image' } });
    const cleanup = graph().delete('/orphan-photo').query({ access_token: 'page-token' }).reply(200, { success: true });
    await expect(
      page.publish({ message: 'Collection', imageUrls: ['https://shop.example/a.jpg', 'https://shop.example/b.jpg'] }),
    ).rejects.toBeInstanceOf(PlatformError);
    expect(cleanup.isDone()).toBe(true);
  });

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
