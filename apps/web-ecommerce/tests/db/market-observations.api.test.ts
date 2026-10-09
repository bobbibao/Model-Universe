import request from 'supertest';
import type { Express } from 'express';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';

// `POST /api/agent/v1/market/observations` (packages/contracts/openapi/web-agent-api.yaml): what the agent's collectors
// report, applied once per Idempotency-Key.
describe('Agent API: market observations', () => {
  let sequelize: Sequelize;
  let app: Express;
  let sku: string;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    app = await testApp('AgentApi.Controller');
    [{ sku }] = await sequelize.query<{ sku: string }>('SELECT sku FROM product ORDER BY id LIMIT 1', {
      type: QueryTypes.SELECT,
    });
  }, 600_000);
  afterAll(() => sequelize.close());

  const post = (key: string, body: object) =>
    request(app).post('/api/agent/v1/market/observations').set('Idempotency-Key', key).send(body);
  const select = <T extends object>(sql: string) => sequelize.query<T>(sql, { type: QueryTypes.SELECT });

  it('stores trend points (upserted per keyword and day) and the source health', async () => {
    const body = {
      source: 'trends',
      status: 'ok',
      observed_at: '2026-10-01T06:45:00+07:00',
      trends: [
        { keyword: 'gunpla', date: '2026-09-30', interest: 77 },
        { keyword: 'gunpla new arrivals', date: '2026-09-30', interest: 12 },
      ],
    };
    const first = await post('collect:trends:2026-10-01', body);
    expect(first.status).toBe(200);
    expect(first.body.detail).toMatch(/2 trend points/);
    const [point] = await select<{ interest: number; source: string }>(
      "SELECT interest, source FROM market_trend_point WHERE keyword = 'gunpla' AND date = '2026-09-30'",
    );
    expect(point).toEqual({ interest: 77, source: 'trends' });
    const [health] = await select<{ status: string; lastSuccessAt: Date | null }>(
      "SELECT status, \"lastSuccessAt\" FROM market_source WHERE name = 'trends'",
    );
    expect(health.status).toBe('ok');
    expect(health.lastSuccessAt).not.toBeNull();

    const replay = await post('collect:trends:2026-10-01', body);
    expect(replay.body).toEqual(first.body);
    const conflict = await post('collect:trends:2026-10-01', { ...body, trends: [] });
    expect(conflict.status).toBe(409);
  });

  it('stores competitor-site prices as watched rows and records a degraded source', async () => {
    const response = await post('collect:competitor_sites:2026-10-01', {
      source: 'competitor_sites',
      status: 'degraded',
      detail: '1 of 3 pages answered 429',
      observed_at: '2026-10-01T07:00:00+07:00',
      competitor_prices: [
        { competitor: 'Builder Supply (demo)', sku, url: 'https://gunpla-source.example/p/1', title: 'Synthetic Gunpla price', price_vnd: 850000 },
      ],
    });
    expect(response.status).toBe(200);
    const [row] = await select<{ watch: boolean; source: string; priceVnd: number }>(
      "SELECT watch, source, \"priceVnd\" FROM market_competitor_price WHERE url = 'https://gunpla-source.example/p/1'",
    );
    expect(row).toEqual({ watch: true, source: 'scraper', priceVnd: 850000 });
    const [health] = await select<{ status: string; detail: string }>(
      "SELECT status, detail FROM market_source WHERE name = 'competitor_sites'",
    );
    expect(health).toEqual({ status: 'degraded', detail: '1 of 3 pages answered 429' });
  });

  it('rejects unknown competitors and SKUs, bad values, and a missing key', async () => {
    const bad = await post('collect:competitor_sites:bad', {
      source: 'competitor_sites',
      observed_at: '2026-10-01T07:00:00+07:00',
      competitor_prices: [{ competitor: 'Nobody', sku: 'NOPE', url: 'ftp://x', price_vnd: -1 }],
      trends: [{ keyword: 'x', date: '30/09/2026', interest: 101 }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/competitor is unknown/),
        expect.stringMatching(/sku NOPE is unknown/),
        expect.stringMatching(/url must be/),
        expect.stringMatching(/price_vnd/),
        expect.stringMatching(/date must be YYYY-MM-DD/),
        expect.stringMatching(/interest must be 0-100/),
      ]),
    );
    const noKey = await request(app).post('/api/agent/v1/market/observations').send({ source: 'fixture' });
    expect(noKey.status).toBe(400);
  });
});
