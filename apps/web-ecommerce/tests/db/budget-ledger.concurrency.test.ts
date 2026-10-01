import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import { setAgentSetting } from './support/agentApi';
import MarketingBudgetService from '../../src/core/server/services/MarketingBudgetService';
import { AgentApiError } from '../../src/shared/server/utils/AgentApiUtils';

// The month's ad budget is a locked row (SELECT ... FOR UPDATE): reservations racing each other never take more
// than the cap together.
describe('marketing budget ledger under concurrency', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    await setAgentSetting(sequelize, 'growth.caps', {
      per_day_vnd: 500000,
      per_campaign_vnd: 3000000,
      monthly_ad_cap_vnd: 10000000,
    });
  }, 600_000);
  afterAll(() => sequelize.close());

  it('lets 20 parallel reservations of 700,000 VND take at most the 10,000,000 VND cap', async () => {
    const ledger = new MarketingBudgetService();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, n) =>
        sequelize.transaction((transaction) => ledger.reserve(`race-${n}`, 700000, null, transaction)),
      ),
    );
    const won = results.filter((r) => r.status === 'fulfilled').length;
    const refused = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof AgentApiError && r.reason.code === 'budget_exceeded',
    ).length;
    expect(won).toBe(14);
    expect(refused).toBe(6);

    const [period] = await sequelize.query<{ reservedVnd: number; capVnd: number }>(
      'SELECT "reservedVnd", "capVnd" FROM marketing_budget_period',
      { type: QueryTypes.SELECT },
    );
    expect(period).toEqual({ reservedVnd: 14 * 700000, capVnd: 10000000 });
    const [entries] = await sequelize.query<{ total: number }>(
      `SELECT SUM("amountVnd")::int AS total FROM marketing_budget_entry WHERE kind = 'reserve'`,
      { type: QueryTypes.SELECT },
    );
    expect(entries.total).toBe(period.reservedVnd);
  });
});
