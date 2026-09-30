import path from 'path';
import { execFileSync } from 'child_process';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEED_ENV, useTestDatabase } from './support/testDb';

// The same SEED_RANDOM_SEED and SEED_NOW give the same shop (plan 5.7). Users are left out (bcrypt salts differ).
// Each seed runs in its own process, like `yarn seed-ci`.
const CHECKSUMS: Record<string, string> = {
  product: `SELECT md5(string_agg(concat_ws('|', sku, price, "importPrice", stock, sold, "createdAt", "categoryId",
    "supplierId"), ',' ORDER BY sku)) FROM product`,
  order: `SELECT md5(string_agg(concat_ws('|', id, "userId", status, total, discount, "couponCode", "createdAt",
    "deliveredAt", "utmSource", "utmMedium", "utmCampaign", "clickIdType", "clickId"), ',' ORDER BY id)) FROM "order"`,
  order_item: `SELECT md5(string_agg(concat_ws('|', id, "orderId", "productId", size, quantity, "unitPrice"), ','
    ORDER BY id)) FROM order_item`,
  stock_import_item: `SELECT md5(string_agg(concat_ws('|', id, "productId", quantity, "createdAt"), ',' ORDER BY id))
    FROM stock_import_item`,
  return_item: `SELECT md5(string_agg(concat_ws('|', ri.id, ri."orderItemId", ri.quantity, ri.reason, ri.condition,
    rr."receivedAt"), ',' ORDER BY ri.id)) FROM return_item ri JOIN return_request rr ON rr.id = ri."returnRequestId"`,
  coupon: `SELECT md5(string_agg(concat_ws('|', code, "usageCount", "startDate", "expirationDate", "minOrderVnd"), ','
    ORDER BY code)) FROM coupon`,
  market_competitor_price: `SELECT md5(string_agg(concat_ws('|', id, "competitorId", "ourProductId", "priceVnd",
    "observedAt"), ',' ORDER BY id)) FROM market_competitor_price`,
  market_trend_point: `SELECT md5(string_agg(concat_ws('|', keyword, date, interest), ',' ORDER BY keyword, date))
    FROM market_trend_point`,
};

const seedOnce = () =>
  execFileSync(process.execPath, [require.resolve('ts-node/dist/bin'), 'scripts/seed.ts'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, ...SEED_ENV, SEED_NOW: '2026-03-15T09:00:00+07:00', SEED_RANDOM_SEED: '11' },
    stdio: 'ignore',
  });

describe('deterministic development seed', () => {
  it('gives identical business tables for the same seed and SEED_NOW', async () => {
    useTestDatabase();
    const checksums = async () => {
      const db = new Sequelize(process.env.DB_NAME as string, process.env.DB_USERNAME as string, process.env.DB_PASSWORD, {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        dialect: 'postgres',
        logging: false,
      });
      const result: Record<string, string> = {};
      for (const [table, sql] of Object.entries(CHECKSUMS)) {
        result[table] = (await db.query<{ md5: string }>(sql, { type: QueryTypes.SELECT }))[0].md5;
      }
      await db.close();
      return result;
    };
    seedOnce();
    const first = await checksums();
    seedOnce();
    const second = await checksums();
    expect(Object.values(first).every(Boolean)).toBe(true);
    expect(second).toEqual(first);
  }, 900_000);
});
