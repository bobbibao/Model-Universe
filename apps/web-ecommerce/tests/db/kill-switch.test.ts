import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import { callAgent, callApproved, establishedProducts, setAgentSetting, useApprovalSecret } from './support/agentApi';

// The owner's kill switch (`growth.enabled = false`): every shop_change is refused with 403 agent_disabled, even with
// a valid grant; protective writes (end, pause, revert) and ingestion still run.
describe('Agent API: kill switch', () => {
  let sequelize: Sequelize;
  let app: Express;
  let skus: string[];
  beforeAll(async () => {
    useApprovalSecret();
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    skus = (await establishedProducts(sequelize, 2)).map((p) => p.sku);
  }, 600_000);
  afterAll(() => sequelize.close());

  it('refuses changes while off and keeps protective and ingestion writes working', async () => {
    const applied = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'k:1',
      body: { skus: [skus[0]], percent: 10, duration_days: 3 },
    });
    expect(applied.status).toBe(200);

    await setAgentSetting(sequelize, 'growth.enabled', false);
    const refused = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'k:2',
      body: { skus: [skus[1]], percent: 10, duration_days: 3 },
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: expect.any(String), code: 'agent_disabled' });

    const reverted = await callAgent(app, { path: 'actions/k:1/revert', key: 'k:1:revert' });
    expect(reverted.status).toBe(200);
    const outcome = await callAgent(app, {
      path: 'marketing/outcomes',
      key: 'outcome:k',
      body: {
        thread_id: 'thread-k',
        capability: 'promotion',
        verdict: 'inconclusive',
        measured_at: new Date().toISOString(),
      },
    });
    expect(outcome.status).toBe(200);

    await setAgentSetting(sequelize, 'growth.enabled', true);
    const again = await callApproved(app, {
      path: 'pricing/discounts',
      key: 'k:2',
      body: { skus: [skus[1]], percent: 10, duration_days: 3 },
    });
    expect(again.status).toBe(200);
  });
});
