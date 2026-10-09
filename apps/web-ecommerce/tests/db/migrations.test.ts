import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import { MIGRATIONS } from '../../src/core/server/database/migrations';
import { runMigrations } from '../../src/core/server/database/migrations/Migrator';
import { applyAnalyticsViews } from '../../src/core/server/database/analytics/AnalyticsViews';
import { AGENT_SETTING_KEYS } from '../../src/core/server/services/AgentSettingDefinitions';
import events from '../../src/core/server/database/client/seeders/data/events_vn.json';

// Phase 5 migrations (docs/PROJECT_OVERVIEW.md, "Database changes"): a seed already has every table and column
// (they are declared on the models), migrations bring older databases up to date, and running them again changes
// nothing.
const NEW_TABLES = [
  'agent_setting',
  'agent_setting_audit',
  'consent_log',
  'marketing_campaign',
  'marketing_post',
  'ad_campaign',
  'ad_metric_daily',
  'post_metric_daily',
  'marketing_budget_period',
  'marketing_budget_entry',
  'marketing_outcome',
  'marketing_asset',
  'market_competitor',
  'market_competitor_price',
  'market_competitor_campaign',
  'market_trend_point',
  'market_event',
  'market_source',
];
const NEW_COLUMNS: Record<string, string[]> = {
  order: ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'clickId', 'clickIdType', 'landingPath'],
  coupon: ['minOrderVnd', 'source', 'agentActionId', 'campaignRef'],
  product_discount: ['campaignRef'],
};

describe('migrations', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
  }, 600_000);
  afterAll(() => sequelize.close());

  const select = <T extends object>(sql: string) => sequelize.query<T>(sql, { type: QueryTypes.SELECT });
  const count = async (table: string) => Number((await select<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
  const schema = async () => {
    const tables = (
      await select<{ table_name: string }>(
        "SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
      )
    ).map((row) => row.table_name);
    const columns: Record<string, string[]> = {};
    for (const table of Object.keys(NEW_COLUMNS)) {
      columns[table] = Object.keys(await sequelize.getQueryInterface().describeTable(table)).sort();
    }
    return { tables, columns };
  };

  it('are all recorded after a seed', async () => {
    const applied = await select<{ name: string }>('SELECT name FROM "SequelizeMeta" ORDER BY name');
    expect(applied.map((row) => row.name)).toEqual(MIGRATIONS.map((migration) => migration.name).sort());
  });

  // Replay includes 35 migrations twice; keep full assertions within an explicit integration timeout.
  it('change nothing when they run again', async () => {
    const before = await schema();
    const settings = await count('agent_setting');
    for (let round = 0; round < 2; round++) {
      await sequelize.query('DELETE FROM "SequelizeMeta"');
      expect(await runMigrations(sequelize)).toHaveLength(MIGRATIONS.length);
    }
    expect(await schema()).toEqual(before);
    expect(await count('agent_setting')).toBe(settings);
    expect(await count('market_event')).toBe(events.length);
  }, 60000);

  it('bring a database from before phase 5 up to date', async () => {
    for (const table of NEW_TABLES) await sequelize.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    for (const [table, columns] of Object.entries(NEW_COLUMNS)) {
      for (const column of columns) await sequelize.query(`ALTER TABLE "${table}" DROP COLUMN "${column}" CASCADE`);
    }
    await sequelize.query('DELETE FROM "SequelizeMeta"');

    await runMigrations(sequelize);
    await applyAnalyticsViews(sequelize);

    const { tables, columns } = await schema();
    expect(tables).toEqual(expect.arrayContaining(NEW_TABLES));
    for (const [table, expected] of Object.entries(NEW_COLUMNS)) expect(columns[table]).toEqual(expect.arrayContaining(expected));
    expect(await count('agent_setting')).toBe(AGENT_SETTING_KEYS.length);
    expect(await count('market_event')).toBe(events.length);
    expect(await count('analytics.agent_settings')).toBe(AGENT_SETTING_KEYS.length);
    // Existing rows got the new columns' defaults.
    expect(await count("coupon WHERE source = 'admin' AND \"minOrderVnd\" = 0")).toBe(await count('coupon'));
  }, 60000);
});
