import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';

// The automatic revenue target and ad cap (analytics.growth_targets, decision Q5): 110% of the trailing 3-month
// average (or of the same month last year with 12 complete months), and min(10,000,000 VND, 5% of that average).
// The fixture replaces the seeded orders with known monthly totals.

const vnMonth = (monthsAgo: number): { year: number; month: number } => {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // Asia/Ho_Chi_Minh
  const index = now.getUTCFullYear() * 12 + now.getUTCMonth() - monthsAgo;
  return { year: Math.floor(index / 12), month: index % 12 };
};
const midMonth = (monthsAgo: number) => {
  const { year, month } = vnMonth(monthsAgo);
  return new Date(Date.UTC(year, month, 15, 5)); // noon in Vietnam
};

describe('automatic growth targets', () => {
  let sequelize: Sequelize;
  let userId: number;
  beforeAll(async () => {
    sequelize = await seedTestDatabase();
    const [user] = await sequelize.query<{ id: number }>("SELECT id FROM \"user\" WHERE role = 'USER' LIMIT 1", {
      type: QueryTypes.SELECT,
    });
    userId = user.id;
  }, 600_000);
  afterAll(() => sequelize.close());

  const setOrders = async (totals: Record<number, number>) => {
    await sequelize.query('DELETE FROM return_item; DELETE FROM return_request; DELETE FROM order_item; DELETE FROM "order"');
    for (const [monthsAgo, total] of Object.entries(totals)) {
      await sequelize.query(
        `INSERT INTO "order" ("userId", status, "paymentMethod", "paymentStatus", subtotal, discount, "shippingFee", tax,
           total, "recipientName", phone, address, city, "createdAt", "updatedAt")
         VALUES (:userId, 'DELIVERED', 'COD', 'PAID', :total, 0, 0, 0, :total, 'Khách', '0900000000', '1 Đường A',
           'Hà Nội', :at, :at)`,
        { replacements: { userId, total, at: midMonth(Number(monthsAgo)) } },
      );
    }
  };
  const setGoal = (revenueTarget: number | 'auto') =>
    sequelize.query(
      `UPDATE agent_setting SET value = jsonb_set(value, '{revenue_target_vnd}', to_jsonb(:target::text))
       WHERE key = 'growth.goal'`,
      { replacements: { target: revenueTarget } },
    );
  const targets = async () =>
    (await sequelize.query<Record<string, string>>('SELECT * FROM analytics.growth_targets', { type: QueryTypes.SELECT }))[0];

  it('targets 110% of the last three complete months and caps ads at 5% of revenue, at most 10M', async () => {
    await setOrders({ 1: 360_000_000, 2: 330_000_000, 3: 300_000_000, 4: 999_000_000 });
    const row = await targets();
    expect(Number(row.trailing_monthly_revenue_vnd)).toBe(330_000_000);
    expect(Number(row.revenue_target_vnd)).toBe(363_000_000);
    expect(row.revenue_target_source).toBe('auto_trailing_3m');
    expect(Number(row.monthly_ad_cap_vnd)).toBe(10_000_000);
    expect(row.monthly_ad_cap_source).toBe('auto');
  });

  it('caps ads at 5% of a small revenue', async () => {
    await setOrders({ 1: 60_000_000 });
    const row = await targets();
    expect(Number(row.revenue_target_vnd)).toBe(66_000_000);
    expect(Number(row.monthly_ad_cap_vnd)).toBe(3_000_000);
  });

  it('uses the same month last year once there are 12 complete months', async () => {
    const totals: Record<number, number> = {};
    for (let monthsAgo = 1; monthsAgo <= 13; monthsAgo++) totals[monthsAgo] = 100_000_000;
    totals[12] = 200_000_000; // this month, one year ago
    await setOrders(totals);
    const row = await targets();
    expect(Number(row.revenue_target_vnd)).toBe(220_000_000);
    expect(row.revenue_target_source).toBe('auto_last_year');
  });

  it("keeps the owner's number", async () => {
    await sequelize.query(
      `UPDATE agent_setting SET value = jsonb_set(value, '{revenue_target_vnd}', '500000000'::jsonb) WHERE key = 'growth.goal'`,
    );
    const row = await targets();
    expect(Number(row.revenue_target_vnd)).toBe(500_000_000);
    expect(row.revenue_target_source).toBe('owner');
    await setGoal('auto');
    expect((await targets()).revenue_target_source).not.toBe('owner');
  });

  it('has no target and a zero cap without history', async () => {
    await setOrders({});
    const row = await targets();
    expect(row.revenue_target_vnd).toBeNull();
    expect(row.revenue_target_source).toBe('none');
    expect(Number(row.monthly_ad_cap_vnd)).toBe(0);
  });
});
