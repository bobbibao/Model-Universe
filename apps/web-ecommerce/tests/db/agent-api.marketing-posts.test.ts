import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import {
  callAgent,
  callApproved,
  establishedProducts,
  select,
  setAutonomy,
  useApprovalSecret,
} from './support/agentApi';
import { facebookPage, FakeFacebookPage } from '../../src/core/server/services/marketing/platforms';

// Facebook Page posts through the Agent API, on the fake Page (FACEBOOK_PAGE_MODE=fake): the web builds the tracked
// link and the image URL, enforces the posting rhythm, and deletes the post on revert.
describe('Agent API: Facebook posts', () => {
  let sequelize: Sequelize;
  let app: Express;
  let sku: string;
  const page = () => facebookPage() as FakeFacebookPage;
  beforeAll(async () => {
    useApprovalSecret();
    process.env.SHOP_PUBLIC_URL = 'https://shop.example.vn';
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    [{ sku }] = await establishedProducts(sequelize, 1);
    await callApproved(app, {
      path: 'marketing/campaigns',
      key: 'm:campaign',
      body: {
        ref: 'ag-feed0001-opt1',
        name: 'Bài đăng',
        objective: 'traffic',
        channels: ['facebook_post'],
        duration_days: 7,
      },
    });
  }, 600_000);
  afterAll(() => sequelize.close());

  it('publishes a post with the tracked link and the product image, once per key', async () => {
    const body = {
      ref: 'post-autumn-1',
      campaign_ref: 'ag-feed0001-opt1',
      message: 'Bộ sưu tập mới đã có mặt tại cửa hàng!',
      link_path: '/products?category=shoes',
      sku,
    };
    const response = await callApproved(app, { path: 'marketing/posts', key: 'm:post:1', body });
    expect(response.status).toBe(200);
    const [post] = await select<Record<string, string | null>>(
      sequelize,
      `SELECT status, link, "imageUrl", "externalId", "campaignRef" FROM marketing_post WHERE ref = 'post-autumn-1'`,
    );
    expect(post.status).toBe('published');
    expect(post.externalId).toMatch(/^fake-post-/);
    expect(post.campaignRef).toBe('ag-feed0001-opt1');
    const link = new URL(post.link as string);
    expect(link.origin + link.pathname).toBe('https://shop.example.vn/products');
    expect(Object.fromEntries(link.searchParams)).toEqual({
      category: 'shoes',
      utm_source: 'facebook',
      utm_medium: 'social',
      utm_campaign: 'ag-feed0001-opt1',
    });
    expect(post.imageUrl).toMatch(/^https?:\/\//);
    const published = page().calls.filter((call) => call.method === 'publish');
    expect(published).toHaveLength(1);
    expect(published[0].args).toMatchObject({ message: body.message, link: post.link, scheduledAt: null });

    const replay = await callAgent(app, { path: 'marketing/posts', key: 'm:post:1', body });
    expect(replay.body).toEqual(response.body);
    expect(page().calls.filter((call) => call.method === 'publish')).toHaveLength(1);
  });

  it('keeps posts 4 hours apart, schedules ahead, and refuses more than 30 days ahead', async () => {
    const soon = await callApproved(app, {
      path: 'marketing/posts',
      key: 'm:post:2',
      body: { ref: 'post-autumn-2', message: 'Thêm một bài nữa' },
    });
    expect(soon.status).toBe(422);
    expect(soon.body).toMatchObject({ code: 'limit_exceeded', reason: 'frequency' });

    const at = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    const scheduled = await callApproved(app, {
      path: 'marketing/posts',
      key: 'm:post:3',
      body: { ref: 'post-autumn-3', message: 'Hẹn gặp bạn cuối tuần', scheduled_at: at },
    });
    expect(scheduled.status).toBe(200);
    const [row] = await select<{ status: string; scheduledAt: Date }>(
      sequelize,
      `SELECT status, "scheduledAt" FROM marketing_post WHERE ref = 'post-autumn-3'`,
    );
    expect(row.status).toBe('scheduled');
    expect(row.scheduledAt.toISOString()).toBe(at);

    const far = await callApproved(app, {
      path: 'marketing/posts',
      key: 'm:post:4',
      body: {
        ref: 'post-autumn-4',
        message: 'Xa quá',
        scheduled_at: new Date(Date.now() + 40 * 24 * 3600_000).toISOString(),
      },
    });
    expect(far.status).toBe(422);
    expect(far.body.reason).toBe('schedule');
  });

  it('asks a person while facebook_post is in shadow, and auto-posts only copy without a price claim', async () => {
    const shadow = await callAgent(app, {
      path: 'marketing/posts',
      key: 'm:post:5',
      body: {
        ref: 'post-autumn-5',
        message: 'Xin chào',
        scheduled_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      },
    });
    expect(shadow.status).toBe(403);
    expect(shadow.body).toMatchObject({ code: 'approval_required', reason: 'shadow' });

    await setAutonomy(sequelize, { facebook_post: 'auto_low' });
    const later = (days: number) => new Date(Date.now() + days * 24 * 3600_000).toISOString();
    const plain = await callAgent(app, {
      path: 'marketing/posts',
      key: 'm:post:6',
      body: { ref: 'post-autumn-6', message: 'Phong cách mới cho mùa thu', scheduled_at: later(4) },
    });
    expect(plain.status).toBe(200);
    const price = await callAgent(app, {
      path: 'marketing/posts',
      key: 'm:post:7',
      body: { ref: 'post-autumn-7', message: 'Giảm 20% toàn bộ giày', scheduled_at: later(5) },
    });
    expect(price.status).toBe(403);
    expect(price.body.reason).toBe('above_low_caps');
    await setAutonomy(sequelize, { facebook_post: 'shadow' });
  });

  it('deletes the post from the Page when reverted', async () => {
    const response = await callAgent(app, { path: 'actions/m:post:1/revert', key: 'm:post:1:revert' });
    expect(response.status).toBe(200);
    expect(response.body.detail).toMatch(/deleted from the Page/);
    const [post] = await select<{ status: string; externalId: string }>(
      sequelize,
      `SELECT status, "externalId" FROM marketing_post WHERE ref = 'post-autumn-1'`,
    );
    expect(post.status).toBe('removed');
    expect(page().calls).toContainEqual({ method: 'remove', args: post.externalId });
  });
});
