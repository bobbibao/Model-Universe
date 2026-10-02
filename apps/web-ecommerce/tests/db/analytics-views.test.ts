import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import { ANALYTICS_VIEWS } from '../../src/core/server/database/analytics/AnalyticsViews';

// The agent reads the shop only through the analytics views, as a read-only role (infra/sql/ci_reader.sql). The test
// creates a role with the same grants and checks every view is readable and nothing is writable.
const ROLE = 'ci_reader_webtest';
const PASSWORD = 'webtest-reader';

describe('analytics views as the read-only role', () => {
  let sequelize: Sequelize;
  let reader: Sequelize;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    const db = process.env.DB_NAME as string;
    await sequelize.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN; END IF;
    END $$`);
    await sequelize.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}'`);
    await sequelize.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
    await sequelize.query(`GRANT CONNECT ON DATABASE "${db}" TO ${ROLE}`);
    await sequelize.query(`GRANT USAGE ON SCHEMA analytics TO ${ROLE}`);
    await sequelize.query(`GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO ${ROLE}`);
    reader = new Sequelize(db, ROLE, PASSWORD, {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      dialect: 'postgres',
      logging: false,
    });
  }, 600_000);
  afterAll(async () => {
    await reader.close();
    await sequelize.close();
  });

  it.each(ANALYTICS_VIEWS)('reads analytics.%s', async (view) => {
    await expect(reader.query(`SELECT * FROM analytics.${view} LIMIT 5`, { type: QueryTypes.SELECT })).resolves.toBeDefined();
  });

  it('cannot read the tables or write anything', async () => {
    await expect(reader.query('SELECT * FROM product LIMIT 1')).rejects.toThrow(/permission denied/);
    await expect(reader.query("UPDATE agent_setting SET version = 99 WHERE key = 'autonomy'")).rejects.toThrow();
    await expect(
      reader.query("INSERT INTO market_source (name, status, \"createdAt\", \"updatedAt\") VALUES ('x', 'ok', NOW(), NOW())"),
    ).rejects.toThrow();
  });

  it('exposes no customer data', async () => {
    const columns = await sequelize.query<{ column_name: string }>(
      "SELECT DISTINCT column_name::text AS column_name FROM information_schema.columns WHERE table_schema = 'analytics'",
      { type: QueryTypes.SELECT },
    );
    const names = columns.map((row) => row.column_name);
    for (const forbidden of ['user_id', 'userId', 'email', 'phone', 'address', 'recipientName', 'click_id', 'clickId']) {
      expect(names).not.toContain(forbidden);
    }
  });
});
