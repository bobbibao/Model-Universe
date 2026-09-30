import { QueryTypes } from 'sequelize';
import { useTestDatabase } from './support/testDb';

// The e2e seed (`yarn seed-ci`, the compose `seed` service): strict development profile, then the analytics views the
// agent reads as `ci_reader`. The web creates the views when it initializes, so they must exist right after seeding.
const AGENT_VIEWS = ['stock_on_hand', 'units_sold_30d', 'returns', 'clearance_sales'];

describe('seed-ci', () => {
  it('seeds the development data strictly and creates the analytics views', async () => {
    useTestDatabase();
    Object.assign(process.env, { SEED_DATA: 'true', DROP_TABLES: 'true', SEED_PROFILE: 'development', STRICT_SEED: 'true' });
    const DatabaseProvider = (await import('@/core/server/database/Database.Provider')).default;
    await DatabaseProvider.initialize();
    const sequelize = DatabaseProvider.getInstance();
    try {
      const [{ count }] = await sequelize.query<{ count: string }>('SELECT count(*) FROM product', {
        type: QueryTypes.SELECT,
      });
      expect(Number(count)).toBeGreaterThan(0);
      const views = await sequelize.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.views WHERE table_schema = 'analytics'",
        { type: QueryTypes.SELECT },
      );
      expect(views.map((view) => view.table_name)).toEqual(expect.arrayContaining(AGENT_VIEWS));
      const stock = await sequelize.query('SELECT * FROM analytics.stock_on_hand', { type: QueryTypes.SELECT });
      expect(stock.length).toBe(Number(count));
    } finally {
      await sequelize.close();
    }
  }, 600_000);
});
