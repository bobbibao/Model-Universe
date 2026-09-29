import { Sequelize } from 'sequelize-typescript';
import Logger from '../../../../shared/server/utils/logger';

// Read-only views for the CI agent service (docs/adr/0002). The agent reads ONLY these, through the `ci_reader`
// role (infra/sql/ci_reader.sql), never the tables themselves. They are the contract between this app's schema
// and the agent's SqlShopReadAdapter: change a view and that adapter together. No customer data (user ids, names,
// addresses, free text) appears in any view. Amounts are whole VND.
//
// Views hold no data, so they are dropped and recreated on every start: the definitions here are always the live
// ones (this app has no migrations). The `ci_reader` default privileges re-grant SELECT on the new views.

const SCHEMA = 'analytics';

// Name -> SELECT. Order does not matter: the views only read tables.
const VIEWS: Record<string, string> = {
  // Sellable products only (not discontinued, not held back): what the agent may act on. `stocked_at` is the
  // latest stock arrival, else the product's creation: the start of "days in stock".
  stock_on_hand: `
    SELECT p.sku, p.name, c.name AS category, p.stock AS quantity,
           p."importPrice" AS unit_cost_vnd, p.price AS unit_price_vnd, p."salesChannel"::text AS sales_channel,
           COALESCE(li.last_import_at, p."createdAt") AS stocked_at
    FROM product p
    JOIN category c ON c.id = p."categoryId"
    LEFT JOIN (
      SELECT sii."productId", MAX(si."createdAt") AS last_import_at
      FROM stock_import_item sii
      JOIN stock_import si ON si.id = sii."stockImportId"
      GROUP BY sii."productId"
    ) li ON li."productId" = p.id
    WHERE NOT p."isArchived" AND p."inventoryStatus" = 'available'`,

  // Units sold per SKU over the last 30 days (orders not cancelled), for every product whatever its status.
  units_sold_30d: `
    SELECT p.sku, SUM(oi.quantity)::int AS units
    FROM order_item oi
    JOIN "order" o ON o.id = oi."orderId"
    JOIN product p ON p.id = oi."productId"
    WHERE o.status <> 'CANCELLED' AND o."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY p.sku`,

  // Received returns (goods back, condition known), one row per returned line, for every product.
  returns: `
    SELECT rr."orderId" AS order_id, p.sku, ri.reason::text AS reason, ri.condition::text AS condition,
           ri.quantity, ri."refundAmount" AS refund_vnd, rr."receivedAt" AS returned_at
    FROM return_item ri
    JOIN return_request rr ON rr.id = ri."returnRequestId"
    JOIN order_item oi ON oi.id = ri."orderItemId"
    JOIN product p ON p.id = oi."productId"
    WHERE rr.status = 'RECEIVED'`,

  // Sales made while an agent discount was running on the product (the "recovered value" KPI).
  clearance_sales: `
    SELECT p.sku, o."createdAt" AS sold_at, oi."unitPrice" * oi.quantity AS revenue_vnd
    FROM order_item oi
    JOIN "order" o ON o.id = oi."orderId"
    JOIN product p ON p.id = oi."productId"
    WHERE o.status <> 'CANCELLED'
      AND EXISTS (
        SELECT 1 FROM product_discount d
        WHERE d."productId" = oi."productId"
          AND d."startsAt" <= o."createdAt"
          AND o."createdAt" < LEAST(d."endsAt", d."revokedAt")
      )`,
};

// Recreates every view in one transaction. A failure is logged, not fatal: the shop keeps working, but the CI
// agent cannot read it until this is fixed (it reports "analytics views missing").
export const applyAnalyticsViews = async (sequelize: Sequelize): Promise<void> => {
  try {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`, { transaction });
      for (const [name, select] of Object.entries(VIEWS)) {
        await sequelize.query(`DROP VIEW IF EXISTS ${SCHEMA}.${name}`, { transaction });
        await sequelize.query(`CREATE VIEW ${SCHEMA}.${name} AS ${select}`, { transaction });
      }
    });
    Logger.INFO(`Analytics views ready: ${Object.keys(VIEWS).join(', ')}.`);
  } catch (error) {
    Logger.ERROR('Analytics views could not be created; the CI agent cannot read the shop until this is fixed:', error);
  }
};
