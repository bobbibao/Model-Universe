import { QueryTypes } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import { calculatePercentageChange } from '../../../shared/server/utils/utils';

// Months are grouped in the shop's time zone. Revenue excludes cancelled orders.
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_MONTHS = 24;
const MAX_LIMIT = 20;

type Row = Record<string, string | number | null>;

const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' });

// 'YYYY-MM' keys of the last `count` months, oldest first, ending with the current month.
const lastMonthKeys = (count: number): string[] => {
  const [year, month] = monthFormatter.format(new Date()).split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

// Earliest timestamp that can fall in the first of the given months (a day of margin for the time zone).
const seriesStart = (keys: string[]) => new Date(`${keys[0]}-01T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value && value > 0 ? Math.min(value, max) : fallback;

export default class DashboardService {
  private query<T extends Row>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
    return DatabaseProvider.getInstance().query<T>(sql, { replacements, type: QueryTypes.SELECT });
  }

  // Revenue, orders, discounts, new customers and import costs per month.
  async getMonthlySeries(monthCount?: number) {
    const keys = lastMonthKeys(clamp(monthCount, 12, MAX_MONTHS));
    const from = new Date(seriesStart(keys));
    const monthExpr = (column: string) => `to_char(${column} AT TIME ZONE :tz, 'YYYY-MM')`;
    const [orders, customers, imports] = await Promise.all([
      this.query(
        `SELECT ${monthExpr('"createdAt"')} AS month, COUNT(*) AS orders,
                COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(discount), 0) AS discount
           FROM "order" WHERE status <> 'CANCELLED' AND "createdAt" >= :from GROUP BY 1`,
        { tz: TIME_ZONE, from },
      ),
      this.query(
        `SELECT ${monthExpr('"createdAt"')} AS month, COUNT(*) AS customers
           FROM "user" WHERE role = 'USER' AND "createdAt" >= :from GROUP BY 1`,
        { tz: TIME_ZONE, from },
      ),
      this.query(
        `SELECT ${monthExpr('"createdAt"')} AS month, COALESCE(SUM("totalCost"), 0) AS cost
           FROM stock_import WHERE "createdAt" >= :from GROUP BY 1`,
        { tz: TIME_ZONE, from },
      ),
    ]);
    const byMonth = (rows: Row[]) => new Map(rows.map((row) => [String(row.month), row]));
    const orderRows = byMonth(orders);
    const customerRows = byMonth(customers);
    const importRows = byMonth(imports);
    return keys.map((month) => ({
      month,
      revenue: Number(orderRows.get(month)?.revenue || 0),
      orders: Number(orderRows.get(month)?.orders || 0),
      discount: Number(orderRows.get(month)?.discount || 0),
      newCustomers: Number(customerRows.get(month)?.customers || 0),
      importCost: Number(importRows.get(month)?.cost || 0),
    }));
  }

  // KPI cards: all-time totals, plus this month compared with last month.
  async getSummary() {
    const [previous, current] = await this.getMonthlySeries(2);
    const [totals] = await this.query(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM "order" WHERE status <> 'CANCELLED') AS revenue,
         (SELECT COUNT(*) FROM "order" WHERE status <> 'CANCELLED') AS orders,
         (SELECT COUNT(*) FROM "user" WHERE role = 'USER') AS customers,
         (SELECT COUNT(*) FROM product WHERE "isArchived" = false) AS products,
         (SELECT COUNT(*) FROM product WHERE "isArchived" = false AND stock = 0) AS "outOfStock",
         (SELECT COUNT(*) FROM "order" WHERE status = 'PROCESSING') AS "pendingOrders"`,
    );
    const metric = (total: unknown, currentValue: number, previousValue: number) => ({
      total: Number(total || 0),
      current: currentValue,
      previous: previousValue,
      change: Math.round(calculatePercentageChange(previousValue, currentValue) * 10) / 10,
    });
    return {
      revenue: metric(totals.revenue, current.revenue, previous.revenue),
      orders: metric(totals.orders, current.orders, previous.orders),
      customers: metric(totals.customers, current.newCustomers, previous.newCustomers),
      products: { total: Number(totals.products || 0), outOfStock: Number(totals.outOfStock || 0) },
      pendingOrders: Number(totals.pendingOrders || 0),
    };
  }

  // Stock left vs units sold per category (visible products).
  async getInventoryByCategory() {
    const rows = await this.query(
      `SELECT c.id, c.name, COALESCE(SUM(p.stock), 0) AS stock, COALESCE(SUM(p.sold), 0) AS sold
         FROM category c
         LEFT JOIN product p ON p."categoryId" = c.id AND p."isArchived" = false
        GROUP BY c.id, c.name
        ORDER BY COALESCE(SUM(p.stock), 0) + COALESCE(SUM(p.sold), 0) DESC, c.name`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      stock: Number(row.stock),
      sold: Number(row.sold),
    }));
  }

  async getGenderRatio() {
    const rows = await this.query(`SELECT gender, COUNT(*) AS total FROM "user" WHERE role = 'USER' GROUP BY gender`);
    const count = (gender: string | null) => Number(rows.find((row) => row.gender === gender)?.total || 0);
    return { male: count('M'), female: count('F'), unknown: count(null) };
  }

  async getRecentOrders(limit?: number) {
    const rows = await this.query(
      `SELECT o.id, o."recipientName", o.total, o.status, o."createdAt", COALESCE(SUM(oi.quantity), 0) AS quantity
         FROM "order" o LEFT JOIN order_item oi ON oi."orderId" = o.id
        GROUP BY o.id ORDER BY o."createdAt" DESC LIMIT :limit`,
      { limit: clamp(limit, 5, MAX_LIMIT) },
    );
    return rows.map((row) => ({
      id: Number(row.id),
      recipientName: String(row.recipientName),
      total: Number(row.total),
      status: String(row.status),
      createdAt: row.createdAt,
      quantity: Number(row.quantity),
    }));
  }

  async getTopProducts(limit?: number) {
    const rows = await this.query(
      `SELECT oi."productId", MAX(oi."productName") AS name, SUM(oi.quantity) AS quantity,
              SUM(oi.quantity * oi."unitPrice") AS revenue
         FROM order_item oi JOIN "order" o ON o.id = oi."orderId"
        WHERE o.status <> 'CANCELLED'
        GROUP BY oi."productId" ORDER BY SUM(oi.quantity) DESC, revenue DESC LIMIT :limit`,
      { limit: clamp(limit, 8, MAX_LIMIT) },
    );
    return rows.map((row) => ({
      productId: Number(row.productId),
      name: String(row.name),
      quantity: Number(row.quantity),
      revenue: Number(row.revenue),
    }));
  }

  async getTopCustomers(limit?: number) {
    const rows = await this.query(
      `SELECT u.id, u."firstName", u."lastName", u.email, COUNT(o.id) AS orders, SUM(o.total) AS spent
         FROM "order" o JOIN "user" u ON u.id = o."userId"
        WHERE o.status <> 'CANCELLED'
        GROUP BY u.id ORDER BY SUM(o.total) DESC LIMIT :limit`,
      { limit: clamp(limit, 8, MAX_LIMIT) },
    );
    return rows.map((row) => ({
      userId: Number(row.id),
      name: `${row.lastName} ${row.firstName}`,
      email: String(row.email),
      orders: Number(row.orders),
      spent: Number(row.spent),
    }));
  }

  // Data for the pie charts.
  async getDistributions() {
    const [orderStatus, categoryShare, stock, userRoles] = await Promise.all([
      this.query(`SELECT status AS label, COUNT(*) AS value FROM "order" GROUP BY status ORDER BY status`),
      this.query(
        `SELECT c.name AS label, COUNT(p.id) AS value
           FROM category c JOIN product p ON p."categoryId" = c.id AND p."isArchived" = false
          GROUP BY c.name ORDER BY COUNT(p.id) DESC`,
      ),
      this.query(
        `SELECT COUNT(*) FILTER (WHERE stock > 0) AS "inStock", COUNT(*) FILTER (WHERE stock = 0) AS "outOfStock"
           FROM product WHERE "isArchived" = false`,
      ),
      this.query(`SELECT role AS label, COUNT(*) AS value FROM "user" GROUP BY role ORDER BY role`),
    ]);
    const toSlices = (rows: Row[]) => rows.map((row) => ({ label: String(row.label), value: Number(row.value) }));
    return {
      orderStatus: toSlices(orderStatus),
      categoryShare: toSlices(categoryShare),
      stockAvailability: { inStock: Number(stock[0]?.inStock || 0), outOfStock: Number(stock[0]?.outOfStock || 0) },
      userRoles: toSlices(userRoles),
    };
  }
}
