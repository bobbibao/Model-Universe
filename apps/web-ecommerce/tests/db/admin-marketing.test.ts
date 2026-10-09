import type { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { useTestDatabase, testApp } from './support/testDb';
import { MIGRATIONS } from '../../src/core/server/database/migrations';
import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import AdminMarketingService from '../../src/core/server/services/AdminMarketingService';
import AdminMarketingModel from '../../src/core/server/database/client/models/AdminMarketing.Model';
import MarketingCampaignModel from '../../src/core/server/database/client/models/MarketingCampaign.Model';
import MarketingPostModel from '../../src/core/server/database/client/models/MarketingPost.Model';
import MarketingBudgetEntryModel from '../../src/core/server/database/client/models/MarketingBudgetEntry.Model';
import AgentSettingService from '../../src/core/server/services/AgentSettingService';
import MarketingCampaignService from '../../src/core/server/services/MarketingCampaignService';
import MailService from '../../src/core/server/services/MailService';
import {
  facebookPage,
  adPlatform,
  FakeAdPlatform,
  FakeFacebookPage,
  resetPlatforms,
} from '../../src/core/server/services/marketing/platforms';
import { makeUser } from '../unit/support/gatewayApp';

describe('admin marketing lifecycle on fake platforms', () => {
  let db: Sequelize;
  let uploads: string;
  const service = new AdminMarketingService();
  beforeAll(async () => {
    useTestDatabase();
    uploads = await mkdtemp(join(tmpdir(), 'marketing-media-test-'));
    process.env.UPLOAD_DIR = uploads;
    process.env.FACEBOOK_PAGE_MODE = 'fake';
    process.env.GOOGLE_ADS_MODE = 'fake';
    resetPlatforms();
    db = DatabaseProvider.getInstance();
    db.addModels(Reflect.get(DatabaseProvider, 'models'));
    await db.sync({ force: true });
    await AdminMarketingModel.drop();
    const migration = MIGRATIONS.find(item => item.name === '2026-10-07-01-admin-marketing-drafts');
    if (!migration) throw new Error('The retained admin marketing migration is missing.');
    await migration.up({ context: { sequelize: db } });
    jest.spyOn(AgentSettingService.prototype, 'getTargets').mockResolvedValue({ monthly_ad_cap_vnd: 1000000 } as never);
    jest.spyOn(MailService.prototype, 'sendNotification').mockResolvedValue('notified');
  }, 600000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close();
    if (!uploads.startsWith(join(tmpdir(), 'marketing-media-test-')))
      throw new Error('Unexpected test upload directory');
    await rm(uploads, { recursive: true, force: true });
  });
  it('concurrent publishes create one Facebook post; submitted copy cannot be edited', async () => {
    const draft = await service.save(makeUser(), {
      name: 'Admin post',
      channel: 'facebook',
      message: 'Nội dung đã chỉnh sửa',
    });
    await Promise.all([service.publish(makeUser(), draft.id), service.publish(makeUser(), draft.id)]);
    expect(await MarketingPostModel.count()).toBe(1);
    const post = await MarketingPostModel.findOne();
    expect(post).toMatchObject({ agentActionId: null, message: 'Nội dung đã chỉnh sửa' });
    expect((facebookPage() as FakeFacebookPage).calls.filter((c) => c.method === 'publish')).toHaveLength(1);
    await expect(service.save(makeUser(), { name: 'Edit', channel: 'facebook' }, draft.id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it('creates Google ads paused, runs/pauses them, and excludes them from Agent pause-all', async () => {
    const draft = await service.save(makeUser(), {
      name: 'Admin Google',
      channel: 'google',
      dailyBudgetVnd: 100000,
      durationDays: 3,
      headlines: ['New Gunpla collection', 'Shop model kits', 'Build essentials'],
      descriptions: ['Explore new model kits', 'Discover your next build'],
      keywords: ['gunpla'],
    });
    await service.publish(makeUser(), draft.id);
    const ads = adPlatform('google') as FakeAdPlatform;
    expect(ads.calls.filter((c) => c.method === 'createPaused')).toHaveLength(1);
    expect(await MarketingBudgetEntryModel.sum('amountVnd', { where: { kind: 'reserve' } })).toBe(300000);
    await service.control(makeUser(), draft.id, 'activate');
    await new MarketingCampaignService().pauseAllAds(7);
    expect(ads.calls.filter((c) => c.method === 'pause')).toHaveLength(0);
    expect((await service.list()).find((d) => d.id === draft.id)?.adStatus).toBe('active');
    await service.control(makeUser(), draft.id, 'pause');
    expect(ads.calls.filter((c) => c.method === 'pause')).toHaveLength(1);
    await service.control(makeUser(), draft.id, 'end');
    expect(await MarketingBudgetEntryModel.sum('amountVnd', { where: { kind: 'release' } })).toBe(300000);
    await expect(service.control(makeUser(), draft.id, 'activate')).rejects.toMatchObject({ statusCode: 409 });
    expect((await new MarketingCampaignService().list()).campaigns).toHaveLength(0);
  });
  it('cancels a future scheduled post when its admin campaign ends', async () => {
    const draft = await service.save(makeUser(), {
      name: 'Scheduled',
      channel: 'facebook',
      message: 'See you tomorrow',
      scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    await service.publish(makeUser(), draft.id);
    expect((await service.list()).find((d) => d.id === draft.id)?.postStatus).toBe('scheduled');
    await service.control(makeUser(), draft.id, 'end');
    expect((await service.list()).find((d) => d.id === draft.id)?.postStatus).toBe('removed');
    expect((facebookPage() as FakeFacebookPage).calls.filter((c) => c.method === 'remove')).toHaveLength(1);
  });
  it('restricts the API and media upload to admins', async () => {
    const app = await testApp('AdminMarketing.Controller');
    expect((await request(app).get('/api/admin/marketing/drafts')).status).toBe(401);
    expect((await request(app).post('/api/admin/marketing/assets/upload').set('x-test-role', 'USER')).status).toBe(403);
    const upload = await request(app)
      .post('/api/admin/marketing/assets/upload')
      .set('x-test-role', 'ADMIN')
      .attach('file', Buffer.from([255, 216, 255, 217]), 'asset.jpg');
    expect(upload.status).toBe(201);
    expect(upload.body.data).toMatchObject({ kind: 'image', uploadedBy: 7 });
    expect(upload.body.data.url).toMatch(/^\/uploads\/marketing\/.+\.jpg$/);
    const invalid = await request(app)
      .post('/api/admin/marketing/assets/upload')
      .set('x-test-role', 'ADMIN')
      .attach('file', Buffer.from('no'), 'file.html');
    expect(invalid.status).toBe(400);
  });
  it('rolls back campaign and keeps draft when budget is exceeded', async () => {
    const draft = await service.save(makeUser(), {
      name: 'Too expensive',
      channel: 'google',
      dailyBudgetVnd: 1000000,
      durationDays: 2,
      headlines: ['One', 'Two', 'Three'],
      descriptions: ['First', 'Second'],
      keywords: ['gunpla'],
    });
    await expect(service.publish(makeUser(), draft.id)).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect((await AdminMarketingModel.findByPk(draft.id))?.status).toBe('draft');
    expect(await MarketingCampaignModel.findOne({ where: { ref: draft.ref } })).toBeNull();
  });
});
