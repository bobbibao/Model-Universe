import { QueryTypes } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import PromotionReconciliationModel from '../database/client/models/PromotionReconciliation.Model';
import NotificationDispatchService from './NotificationDispatchService';
import CommercePolicyService from './CommercePolicyService';

const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

// The Vietnam calendar day before `now` (YYYY-MM-DD) and its bounds as instants.
export const previousVietnamDay = (now: Date) => {
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN_OFFSET_MS;
  const start = new Date(today - DAY_MS);
  return { day: new Date(start.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10), start, end: new Date(today) };
};

export interface ReconciliationProblems {
  negativeProfitOrderIds: number[];
  doubleEarnedOrderIds: number[];
  changedPriceProductIds: number[];
}

// The nightly promotion reconciliation (v6.2 SRS non-functional targets): for the previous Vietnam day, the voucher,
// rank and free-shipping money given, the guard's results, the points earned, reversed and redeemed with their reserve,
// and the points liability; then alerts for negative-profit orders, double points and prices changed after approval
// (budget overruns cannot happen: the coupon_budget_valid constraint refuses them). Read-only on business data; one row per day, so overlapping workers and reruns change nothing.
export default class PromotionReconciliationService {
  private notices = new NotificationDispatchService();
  private policies = new CommercePolicyService();

  async list(limit = 60) {
    return PromotionReconciliationModel.findAll({ order: [['day', 'DESC']], limit });
  }

  async run(now = new Date()) {
    const { day, start, end } = previousVietnamDay(now);
    if (await PromotionReconciliationModel.findOne({ where: { day } })) return null;
    const report = await this.report(start, end);
    const problems = report.problems as ReconciliationProblems;
    const problemCount =
      problems.negativeProfitOrderIds.length +
      problems.doubleEarnedOrderIds.length +
      problems.changedPriceProductIds.length;
    const [row, created] = await PromotionReconciliationModel.findOrCreate({
      where: { day },
      defaults: { day, report, problemCount },
    });
    if (created && problemCount) await this.alert(day, problems);
    return row;
  }

  async report(start: Date, end: Date) {
    const db = DatabaseProvider.getInstance();
    const query = <T>(sql: string, replacements: Record<string, unknown> = {}) =>
      db.query(sql, { replacements: { start, end, ...replacements }, type: QueryTypes.SELECT }) as Promise<T[]>;
    const { policy, version } = await this.policies.voucherPolicy();
    const [orders] = await query<Record<string, string | number | null>>(
      `SELECT COUNT(*)::int AS "orders",
              COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS "cancelled",
              COUNT(*) FILTER (WHERE "benefitSnapshot"->>'kind' = 'v6.2')::int AS "withBenefits",
              COUNT(*) FILTER (WHERE "benefitSnapshot"->>'status' = 'STACK_VALID')::int AS "stackValid",
              COUNT(*) FILTER (WHERE "benefitSnapshot"->>'status' = 'VOUCHER_ONLY_VALID')::int AS "voucherOnly",
              COALESCE(SUM(("benefitSnapshot"->'voucher'->>'discountVnd')::bigint), 0)::bigint AS "voucherDiscountVnd",
              COALESCE(SUM(("benefitSnapshot"->'rank'->>'discountVnd')::bigint), 0)::bigint AS "rankDiscountVnd",
              COALESCE(SUM("shippingDiscountVnd"), 0)::bigint AS "shippingDiscountVnd"
         FROM "order" WHERE "createdAt" >= :start AND "createdAt" < :end`,
    );
    // The profit the shop kept on each order with benefits (internal snapshot; never shown to customers).
    const negative = await query<{ id: number }>(
      `SELECT id FROM "order"
        WHERE "createdAt" >= :start AND "createdAt" < :end AND status <> 'CANCELLED'
          AND "benefitSnapshot"->'internal' IS NOT NULL AND jsonb_typeof("benefitSnapshot"->'internal') = 'object'
          AND (CASE WHEN "benefitSnapshot"->>'status' = 'STACK_VALID'
                    THEN ("benefitSnapshot"->'internal'->>'stackProfitVnd')::bigint
                    ELSE ("benefitSnapshot"->'internal'->>'plainProfitVnd')::bigint END) < 0
        ORDER BY id LIMIT 100`,
    );
    const [points] = await query<Record<string, number>>(
      `SELECT COALESCE(SUM("lifetimeDelta") FILTER (WHERE kind = 'earn'), 0)::int AS "earned",
              COALESCE(SUM("lifetimeDelta") FILTER (WHERE kind = 'reverse'), 0)::int AS "reversed",
              COALESCE(-SUM("balanceDelta") FILTER (WHERE kind = 'redeem'), 0)::int AS "redeemed"
         FROM loyalty_ledger WHERE "createdAt" >= :start AND "createdAt" < :end`,
    );
    const [liability] = await query<Record<string, number>>(
      `SELECT COALESCE(SUM(GREATEST(balance, 0)), 0)::bigint AS "availablePoints",
              COUNT(*) FILTER (WHERE balance < 0)::int AS "membersInDebt"
         FROM (SELECT "userId", SUM("balanceDelta") AS balance FROM loyalty_ledger GROUP BY "userId") b`,
    );
    const doubled = await query<{ orderId: number }>(
      `SELECT ("details"->>'orderId')::int AS "orderId" FROM loyalty_ledger
        WHERE kind = 'earn' AND "details"->>'orderId' IS NOT NULL
        GROUP BY "details"->>'orderId' HAVING COUNT(*) > 1 ORDER BY 1 LIMIT 100`,
    );
    const changedPrice = await query<{ id: number }>(
      `SELECT p.id FROM product p JOIN product_price_approval a ON a."productId" = p.id AND a.status = 'APPROVED'
        WHERE p."partnerId" IS NULL AND NOT p."isArchived" AND a."listPriceVnd" <> p.price ORDER BY p.id LIMIT 100`,
    );
    const earned = Number(points?.earned) || 0;
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      policyVersion: version,
      orders: Object.fromEntries(Object.entries(orders ?? {}).map(([key, value]) => [key, Number(value) || 0])),
      points: {
        earned,
        reversed: Number(points?.reversed) || 0,
        redeemed: Number(points?.redeemed) || 0,
        // The provision for the day's new points (not a debt; released when the benefit is used).
        reserveVnd: earned * policy.pointReserveVnd,
        availablePoints: Number(liability?.availablePoints) || 0,
        membersInDebt: Number(liability?.membersInDebt) || 0,
      },
      problems: {
        negativeProfitOrderIds: negative.map((row) => row.id),
        doubleEarnedOrderIds: doubled.map((row) => row.orderId),
        changedPriceProductIds: changedPrice.map((row) => row.id),
      } satisfies ReconciliationProblems,
    };
  }

  // One staff alert per day with problems (Vietnamese text for people).
  private async alert(day: string, problems: ReconciliationProblems) {
    const lines = [
      problems.negativeProfitOrderIds.length &&
        `Đơn lỗ sau khuyến mãi: ${problems.negativeProfitOrderIds.map((id) => `#${id}`).join(', ')}`,
      problems.doubleEarnedOrderIds.length &&
        `Đơn được cộng điểm hai lần: ${problems.doubleEarnedOrderIds.map((id) => `#${id}`).join(', ')}`,
      problems.changedPriceProductIds.length &&
        `Sản phẩm đổi giá sau khi duyệt (mã giảm bị chặn đến khi duyệt lại): ${problems.changedPriceProductIds
          .map((id) => `#${id}`)
          .join(', ')}`,
    ].filter(Boolean);
    await this.notices.alertAdmins({
      dedupeKey: `promotion-reconciliation:${day}`,
      kind: 'promotion_reconciliation',
      orderId: problems.negativeProfitOrderIds[0] ?? null,
      title: `Đối soát khuyến mãi ngày ${day}: ${lines.length} nhóm cần kiểm tra`,
      content: lines.join('\n'),
    });
  }
}
