import request from 'supertest';
import type { Express } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import { callAgent, select } from './support/agentApi';

// /admin/agent/growth: this month against the goal, the agent's measured profit and ROAS per platform, from the
// analytics views.
describe('growth scorecard', () => {
  let sequelize: Sequelize;
  let app: Express;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    app = await testApp('AdminAgentCampaign.Controller', 'AgentApi.Controller');
  }, 600_000);
  afterAll(() => sequelize.close());

  it('reports the month from the views and sums the measured outcomes', async () => {
    const outcome = (verdict: string, profit: number, key: string) =>
      callAgent(app, {
        path: 'marketing/outcomes',
        key,
        body: {
          thread_id: key,
          capability: 'promotion',
          verdict,
          incremental_profit_vnd: profit,
          measured_at: new Date().toISOString(),
        },
      });
    expect((await outcome('positive', 300000, 'score:1')).status).toBe(200);
    expect((await outcome('negative', -100000, 'score:2')).status).toBe(200);

    const response = await request(app).get('/api/admin/agent/campaigns/scorecard').set('x-test-role', 'ADMIN');
    expect(response.status).toBe(200);
    const card = response.body.data;
    const [month] = await select<{ revenue: string }>(
      sequelize,
      `SELECT COALESCE(SUM(revenue_vnd), 0)::bigint AS revenue FROM analytics.sales_daily
       WHERE day >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
    );
    expect(card.revenue_vnd).toBe(Number(month.revenue));
    expect(card.incremental_profit_vnd).toBe(200000);
    expect(card.outcomes).toEqual({ positive: 1, negative: 1 });
    expect(card.target_vnd === null || card.pace_vnd <= card.target_vnd).toBe(true);
    expect(card.roas).toEqual([]);
  });
});
