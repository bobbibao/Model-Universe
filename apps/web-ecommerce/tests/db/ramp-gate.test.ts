import request from 'supertest';
import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import { callAgent, callApproved, select, useApprovalSecret } from './support/agentApi';

// The autonomy ramp (docs/GROWTH_AGENT.md section 4): the brand gate, eligibility for auto_low (10 measured outcomes
// in 90 days, 60% non-negative, no incident in 30 days), the owner's audited force, and the protective demotions.
describe('autonomy ramp gate', () => {
  let sequelize: Sequelize;
  let app: Express;
  beforeAll(async () => {
    useApprovalSecret();
    sequelize = await seedTestDatabase();
    app = await testApp('AdminAgentSetting.Controller', 'AgentApi.Controller');
  }, 600_000);
  afterAll(() => sequelize.close());

  const current = async (key: string) => {
    const response = await request(app).get('/api/admin/agent/settings').set('x-test-role', 'ADMIN');
    return response.body.data.settings.find((entry: { key: string }) => entry.key === key);
  };
  const put = async (key: string, change: (value: Record<string, unknown>) => unknown, extra: object = {}) => {
    const entry = await current(key);
    return request(app)
      .put(`/api/admin/agent/settings/${encodeURIComponent(key)}`)
      .set('x-test-role', 'ADMIN')
      .send({ value: change(entry.value), version: entry.version, ...extra });
  };
  const setMode = (capability: string, mode: string, extra: object = {}) =>
    put('autonomy', (modes) => ({ ...modes, [capability]: mode }), extra);
  const mode = async (capability: string) => (await current('autonomy')).value[capability];
  let outcomes = 0;
  const outcome = (verdict: string, capability = 'promotion') => {
    outcomes += 1;
    return callAgent(app, {
      path: 'marketing/outcomes',
      key: `ramp:outcome:${outcomes}`,
      body: {
        thread_id: `thread-${outcomes}`,
        capability,
        verdict,
        measured_at: new Date(Date.now() - (100 - outcomes) * 60_000).toISOString(),
      },
    });
  };
  const lastAudit = async () =>
    (
      await select<{ reason: string | null; changedBy: number | null }>(
        sequelize,
        `SELECT reason, "changedBy" FROM agent_setting_audit WHERE key = 'autonomy' ORDER BY id DESC LIMIT 1`,
      )
    )[0];

  it('keeps growth capabilities in shadow until the brand guide is approved, even when forced', async () => {
    const refused = await setMode('facebook_post', 'ask');
    expect(refused.status).toBe(400);
    expect(refused.body.userValidationMessages.join(' ')).toContain('facebook_post');
    const forced = await setMode('facebook_post', 'ask', { force: true, reason: 'Thử ngay' });
    expect(forced.status).toBe(400);
    expect(await mode('facebook_post')).toBe('shadow');
  });

  it('refuses auto_low without the track record unless the owner forces it with a reason', async () => {
    expect((await put('brand.approved', () => true)).status).toBe(200);
    const refused = await setMode('promotion', 'auto_low');
    expect(refused.status).toBe(400);
    expect(refused.body.userValidationMessages.join(' ')).toContain('0 kết quả');
    expect((await setMode('promotion', 'auto_low', { force: true })).status).toBe(400); // no reason
    const forced = await setMode('promotion', 'auto_low', { force: true, reason: 'Chủ cửa hàng chấp nhận rủi ro' });
    expect(forced.status).toBe(200);
    expect(await lastAudit()).toEqual({ reason: '[force] Chủ cửa hàng chấp nhận rủi ro', changedBy: 7 });
    expect((await setMode('promotion', 'ask')).status).toBe(200); // stepping down needs no record
  });

  it('allows auto_low after 10 measured outcomes, 60% of them non-negative', async () => {
    for (const verdict of ['positive', 'negative', 'positive', 'inconclusive', 'positive']) {
      expect((await outcome(verdict)).status).toBe(200);
    }
    expect((await setMode('promotion', 'auto_low')).status).toBe(400); // 5 outcomes
    for (const verdict of ['positive', 'negative', 'positive', 'positive', 'inconclusive']) await outcome(verdict);
    expect((await setMode('promotion', 'auto_low')).status).toBe(200);
  });

  it('demotes to ask after two negative outcomes in a row', async () => {
    await outcome('negative');
    expect(await mode('promotion')).toBe('auto_low');
    const second = await outcome('negative');
    expect(second.body.detail).toContain('demoted to ask: promotion');
    expect(await mode('promotion')).toBe('ask');
    expect(await lastAudit()).toEqual({ reason: expect.stringMatching(/^auto-demotion: /), changedBy: null });
  });

  it('demotes on an incident (a guard action) and refuses auto_low for 30 days after it', async () => {
    await outcome('positive'); // 13 outcomes, 9 non-negative
    expect((await setMode('promotion', 'auto_low')).status).toBe(200);
    const ref = 'ag-ramp0000-test';
    const campaign = await callApproved(app, {
      path: 'marketing/campaigns',
      key: 'ramp:campaign',
      body: { ref, name: 'Thử', objective: 'sales', channels: ['promotion'], duration_days: 7 },
    });
    expect(campaign.status).toBe(200);
    const ended = await callAgent(app, {
      path: `promotions/${ref}/end`,
      key: `guard:${ref}:2026100109`,
      body: { reason: 'Khuyến mãi làm giảm lợi nhuận gộp.' },
      actionId: 'guard-negative_promotion',
    });
    expect(ended.status).toBe(200);
    expect(await mode('promotion')).toBe('ask');
    const refused = await setMode('promotion', 'auto_low');
    expect(refused.status).toBe(400);
    expect(refused.body.userValidationMessages.join(' ')).toContain('sự cố');
  });
});
