import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';

// The e2e seed (`yarn seed-ci`, the compose `seed` service): strict development profile, then the analytics views the
// agent reads as `ci_reader`. The web creates the views when it initializes, so they must exist right after seeding,
// and the development shop always shows the agent's two v1 signals.
const AGENT_VIEWS = ['stock_on_hand', 'units_sold_30d', 'returns', 'clearance_sales', 'catalog', 'sales_daily'];

describe('seed-ci', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
  }, 600_000);
  afterAll(() => sequelize.close());

  const count = async (sql: string) =>
    Number((await sequelize.query<{ count: string }>(sql, { type: QueryTypes.SELECT }))[0].count);

  it('seeds the development data strictly and creates the analytics views', async () => {
    const products = await count('SELECT count(*) FROM product');
    expect(products).toBeGreaterThan(0);
    const views = await sequelize.query<{ table_name: string }>(
      "SELECT table_name::text AS table_name FROM information_schema.views WHERE table_schema = 'analytics'",
      { type: QueryTypes.SELECT },
    );
    expect(views.map((view) => view.table_name)).toEqual(expect.arrayContaining(AGENT_VIEWS));
    expect(await count('SELECT count(*) FROM analytics.catalog')).toBe(products);
  });

  it('has a sales history of about 180 days with attributed orders', async () => {
    expect(await count('SELECT count(*) FROM analytics.sales_daily')).toBeGreaterThan(150);
    expect(await count("SELECT count(*) FROM \"order\" WHERE \"utmSource\" IS NOT NULL")).toBeGreaterThan(0);
    expect(await count('SELECT count(*) FROM "order" WHERE "clickId" IS NOT NULL')).toBeGreaterThan(0);
  });

  it('keeps dead-stock candidates: old stock that has not sold in 30 days', async () => {
    const dead = await count(`
      SELECT count(*) FROM analytics.stock_on_hand s
      LEFT JOIN analytics.units_sold_30d u ON u.sku = s.sku
      WHERE s.quantity > 0 AND s.stocked_at < NOW() - INTERVAL '90 days' AND COALESCE(u.units, 0) <= 6`);
    expect(dead).toBeGreaterThanOrEqual(5);
    expect(dead).toBeLessThanOrEqual(40);
  });
});
