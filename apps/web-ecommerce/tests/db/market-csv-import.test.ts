import request from 'supertest';
import type { Express } from 'express';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase, testApp } from './support/testDb';
import MarketService, { CSV_TEMPLATE } from '../../src/core/server/services/MarketService';

// The weekly competitor-price CSV on /admin/agent/market: all rows or none, with one message per invalid row.
describe('competitor price CSV import', () => {
  let sequelize: Sequelize;
  let app: Express;
  let sku: string;
  const service = new MarketService();
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    app = await testApp('AdminAgentMarket.Controller');
    [{ sku }] = await sequelize.query<{ sku: string }>('SELECT sku FROM product ORDER BY id LIMIT 1', {
      type: QueryTypes.SELECT,
    });
  }, 600_000);
  afterAll(() => sequelize.close());

  const count = async () =>
    Number(
      (
        await sequelize.query<{ n: string }>("SELECT count(*) AS n FROM market_competitor_price WHERE source = 'csv'", {
          type: QueryTypes.SELECT,
        })
      )[0].n,
    );

  it('imports every valid row, with Vietnamese thousands separators', async () => {
    const before = await count();
    const csv = [
      'competitor,sku,url,title,price_vnd,observed_at',
      `Thời Trang An Nhiên,${sku},,Giày A,"1.250.000",2026-09-28`,
      'Phong Cách Sài Gòn,,https://shopee.vn/product/1,Giày B,990000 ₫,',
    ].join('\n');
    await expect(service.importPrices(csv)).resolves.toEqual({ imported: 2 });
    expect(await count()).toBe(before + 2);
    const [row] = await sequelize.query<{ priceVnd: number }>(
      'SELECT "priceVnd" FROM market_competitor_price ORDER BY id DESC LIMIT 1 OFFSET 1',
      { type: QueryTypes.SELECT },
    );
    expect(row.priceVnd).toBe(1_250_000);
  });

  it('rejects the whole file and reports each invalid row', async () => {
    const before = await count();
    const csv = [
      'competitor,sku,url,title,price_vnd,observed_at',
      `Thời Trang An Nhiên,${sku},,ok,100000,2026-09-28`,
      `Không Có Thật,${sku},,x,100000,2026-09-28`,
      'Thời Trang An Nhiên,NO-SUCH-SKU,,x,abc,2026-13-45',
      'Thời Trang An Nhiên,,,,100000,',
    ].join('\n');
    const response = await request(app)
      .post('/api/admin/agent/market/prices/import')
      .set('x-test-role', 'ADMIN')
      .send({ csv });
    expect(response.status).toBe(400);
    const messages: string[] = response.body.userValidationMessages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatch(/^Dòng 3: .*Không Có Thật/);
    expect(messages[1]).toMatch(/^Dòng 4: .*NO-SUCH-SKU.*Giá.*Ngày/);
    expect(messages[2]).toMatch(/^Dòng 5: .*mã sản phẩm của mình hoặc đường dẫn/);
    expect(await count()).toBe(before);
  });

  it('refuses a file without the template columns', async () => {
    await expect(service.importPrices('ten,gia\nA,1000\n')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('serves the template', async () => {
    const response = await request(app).get('/api/admin/agent/market/prices/template').set('x-test-role', 'ADMIN');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.text).toContain(CSV_TEMPLATE.split('\n')[0]);
  });
});
