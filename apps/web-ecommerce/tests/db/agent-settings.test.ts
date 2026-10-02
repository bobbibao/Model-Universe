import request from 'supertest';
import type { Express } from 'express';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';

// /admin/agent/settings: camelCase from the console, stored snake_case for the agent, versioned and audited.
describe('agent settings', () => {
  let sequelize: Sequelize;
  let app: Express;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    app = await testApp('AdminAgentSetting.Controller');
  }, 600_000);
  afterAll(() => sequelize.close());

  const select = <T extends object>(sql: string) => sequelize.query<T>(sql, { type: QueryTypes.SELECT });
  const put = (key: string, body: object) =>
    request(app).put(`/api/admin/agent/settings/${encodeURIComponent(key)}`).set('x-test-role', 'ADMIN').send(body);

  it('lists every setting with its version and the computed targets', async () => {
    const response = await request(app).get('/api/admin/agent/settings').set('x-test-role', 'ADMIN');
    expect(response.status).toBe(200);
    const keys = response.body.data.settings.map((entry: { key: string }) => entry.key);
    expect(keys).toEqual(expect.arrayContaining(['growth.enabled', 'growth.goal', 'autonomy']));
    expect(response.body.data.targets).toMatchObject({ revenue_target_source: 'auto_trailing_3m' });
  });

  it('stores a camelCase value as snake_case, bumps the version and audits the change', async () => {
    const response = await put('autonomy', {
      value: {
        promotion: 'ask',
        facebookPost: 'shadow',
        adsMeta: 'shadow',
        adsGoogle: 'shadow',
        adsTiktok: 'off',
        inventory: 'ask',
        opsTasks: 'auto_low',
      },
      version: 1,
      reason: 'Thử tự động cho công việc',
    });
    expect(response.status).toBe(200);
    const [row] = await select<{ value: Record<string, string>; version: number }>(
      "SELECT value, version FROM agent_setting WHERE key = 'autonomy'",
    );
    expect(row.version).toBe(2);
    expect(row.value).toMatchObject({ facebook_post: 'shadow', ads_tiktok: 'off', ops_tasks: 'auto_low' });
    const [audit] = await select<{ reason: string; version: number; changedBy: number }>(
      "SELECT reason, version, \"changedBy\" FROM agent_setting_audit WHERE key = 'autonomy' ORDER BY id DESC LIMIT 1",
    );
    expect(audit).toEqual({ reason: 'Thử tự động cho công việc', version: 2, changedBy: 7 });
    const [view] = await select<{ version: number }>("SELECT version FROM analytics.agent_settings WHERE key = 'autonomy'");
    expect(view.version).toBe(2);
  });

  it('refuses a stale version (someone else saved first)', async () => {
    const response = await put('growth.enabled', { value: false, version: 0 });
    expect(response.status).toBe(409);
  });

  it('validates values by hand', async () => {
    const response = await put('growth.caps', {
      value: { monthlyAdCapVnd: 1_000_000, perCampaignVnd: 3_000_000, perDayVnd: 5_000_000 },
      version: 1,
    });
    expect(response.status).toBe(400);
    expect(response.body.userValidationMessages).toEqual([
      'Ngân sách mỗi ngày không được lớn hơn ngân sách mỗi chiến dịch.',
      'Ngân sách mỗi chiến dịch không được lớn hơn ngân sách quảng cáo tháng.',
    ]);
    expect((await put('autonomy', { value: { promotion: 'always' }, version: 2 })).status).toBe(400);
    expect((await put('no.such.key', { value: 1, version: 0 })).status).toBe(404);
  });

  it('accepts an owner revenue target and reports it in the targets', async () => {
    const response = await put('growth.goal', {
      value: { revenueTargetVnd: 800_000_000, marginFloorPct: 18, maxSpendRatioPct: 6 },
      version: 1,
    });
    expect(response.status).toBe(200);
    const [targets] = await select<{ revenue_target_vnd: string; revenue_target_source: string }>(
      'SELECT revenue_target_vnd, revenue_target_source FROM analytics.growth_targets',
    );
    expect(targets).toEqual({ revenue_target_vnd: '800000000', revenue_target_source: 'owner' });
  });
});
