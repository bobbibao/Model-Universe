import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import { AGENT_SETTING_DEFAULTS, AGENT_SETTING_KEYS } from '../../src/core/server/services/AgentSettingDefinitions';
import { DEV_TREND_KEYWORDS } from '../../src/core/server/database/client/seeders/AgentSetting.Seeder';
import events from '../../src/core/server/database/client/seeders/data/events_vn.json';

// Every new model defines its own seedData (no-op or deterministic), so the generic faker seeder never fills the
// ledger, the settings or the marketing tables with random rows.
const EMPTY_AFTER_SEED = [
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
  'market_source',
];

describe('new models after a development seed', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
  }, 600_000);
  afterAll(() => sequelize.close());

  const select = <T extends object>(sql: string) => sequelize.query<T>(sql, { type: QueryTypes.SELECT });

  it.each(EMPTY_AFTER_SEED)('%s is empty', async (table) => {
    expect((await select<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n).toBe('0');
  });

  it('agent settings are exactly the defaults (with the development trend keywords)', async () => {
    const rows = await select<{ key: string; value: unknown; version: number }>('SELECT * FROM agent_setting');
    expect(rows.map((row) => row.key).sort()).toEqual([...AGENT_SETTING_KEYS].sort());
    for (const row of rows) {
      const expected =
        row.key === 'market.trend_keywords' ? DEV_TREND_KEYWORDS : AGENT_SETTING_DEFAULTS[row.key as keyof typeof AGENT_SETTING_DEFAULTS];
      expect(row.value).toEqual(expected);
      expect(row.version).toBe(1);
    }
  });

  it('market data is the deterministic development set', async () => {
    const competitors = await select<{ name: string }>('SELECT name FROM market_competitor ORDER BY name');
    expect(competitors.map((row) => row.name)).toEqual(['Builder Supply (demo)', 'Colony Hobby (demo)', 'Orbit Kits (demo)']);
    expect((await select<{ n: string }>('SELECT count(*) AS n FROM market_event'))[0].n).toBe(String(events.length));
    const keywords = await select<{ keyword: string }>('SELECT DISTINCT keyword FROM market_trend_point ORDER BY 1');
    expect(keywords.map((row) => row.keyword)).toEqual(DEV_TREND_KEYWORDS.map((item) => item.keyword).sort());
  });
});
