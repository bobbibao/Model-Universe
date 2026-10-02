import { Transaction } from 'sequelize';
import MarketingBudgetEntryModel from '../database/client/models/MarketingBudgetEntry.Model';
import MarketingBudgetPeriodModel from '../database/client/models/MarketingBudgetPeriod.Model';
import { AgentApiError } from '../../../shared/server/utils/AgentApiUtils';
import AgentSettingService from './AgentSettingService';
import { remainingVnd, vnDate, type BudgetState } from './agent/AgentLimits';

// The paid-marketing budget ledger (docs/GROWTH_AGENT.md section 4). A month (`YYYY-MM` in Vietnam) has a cap: this
// month's `analytics.growth_targets.monthly_ad_cap_vnd`, the owner's number or the auto one. Creating an ad reserves
// its whole budget; ending or reverting it releases what it has not spent; spend comes from the platforms through
// the metrics sync. Every change locks the month's row (SELECT ... FOR UPDATE), so concurrent ads can never reserve
// more than the cap. Entries are append-only.
export default class MarketingBudgetService {
  // This month's row, locked, created on first use; its cap follows the current target (an owner's change applies).
  async period(transaction: Transaction, now = new Date()): Promise<MarketingBudgetPeriodModel> {
    const period = vnDate(now).slice(0, 7);
    const cap = (await new AgentSettingService().getTargets(transaction))?.monthly_ad_cap_vnd ?? 0;
    await MarketingBudgetPeriodModel.bulkCreate([{ period, capVnd: cap, reservedVnd: 0, spentVnd: 0 }], {
      transaction,
      ignoreDuplicates: true,
    });
    const row = (await MarketingBudgetPeriodModel.findOne({
      where: { period },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })) as MarketingBudgetPeriodModel;
    if (row.capVnd !== cap) await row.update({ capVnd: cap }, { transaction });
    return row;
  }

  async state(transaction: Transaction, now = new Date()): Promise<BudgetState> {
    const row = await this.period(transaction, now);
    return { cap_vnd: row.capVnd, reserved_vnd: row.reservedVnd, spent_vnd: row.spentVnd };
  }

  // Locks `amount` for an ad in this month's budget (409 budget_exceeded when the month has no room left).
  async reserve(
    adRef: string,
    amount: number,
    agentActionId: number | null,
    transaction: Transaction,
    now = new Date(),
  ) {
    const row = await this.period(transaction, now);
    const remaining = remainingVnd({ cap_vnd: row.capVnd, reserved_vnd: row.reservedVnd, spent_vnd: row.spentVnd });
    if (amount > remaining) {
      throw new AgentApiError('budget_exceeded', `${remaining} VND left in this month's ad budget`, {
        reason: 'monthly_cap',
      });
    }
    await MarketingBudgetEntryModel.create(
      { periodId: row.id, adRef, kind: 'reserve', amountVnd: amount, agentActionId },
      { transaction },
    );
    await row.update({ reservedVnd: row.reservedVnd + amount }, { transaction });
  }

  private async sums(adRef: string, transaction: Transaction) {
    const entries = await MarketingBudgetEntryModel.findAll({ where: { adRef }, transaction });
    const sum = (kind: string) => entries.filter((e) => e.kind === kind).reduce((total, e) => total + e.amountVnd, 0);
    return { reserved: sum('reserve'), released: sum('release'), spent: sum('spend') };
  }

  // What the ad holds and has not spent: reserved - released - spent, over all its entries.
  async unspent(adRef: string, transaction: Transaction): Promise<number> {
    const { reserved, released, spent } = await this.sums(adRef, transaction);
    return Math.max(0, reserved - released - spent);
  }

  // What the platforms reported the ad spent so far.
  async spent(adRef: string, transaction: Transaction): Promise<number> {
    return (await this.sums(adRef, transaction)).spent;
  }

  // Gives back what the ad has not spent (it ended, was reverted, or its budget was lowered by `amount`).
  async release(adRef: string, transaction: Transaction, amount?: number, agentActionId: number | null = null) {
    const unspent = await this.unspent(adRef, transaction);
    const released = Math.min(unspent, amount ?? unspent);
    if (released <= 0) return 0;
    const reserve = await MarketingBudgetEntryModel.findOne({
      where: { adRef, kind: 'reserve' },
      order: [['id', 'DESC']],
      transaction,
    });
    if (!reserve) return 0;
    const row = await MarketingBudgetPeriodModel.findByPk(reserve.periodId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) return 0;
    await MarketingBudgetEntryModel.create(
      { periodId: row.id, adRef, kind: 'release', amountVnd: released, agentActionId },
      { transaction },
    );
    await row.update({ reservedVnd: Math.max(0, row.reservedVnd - released) }, { transaction });
    return released;
  }

  // Spend a platform reported for the ad, booked in the month it happened.
  async recordSpend(adRef: string, amount: number, day: Date, transaction: Transaction) {
    if (amount <= 0) return;
    const row = await this.period(transaction, day);
    await MarketingBudgetEntryModel.create(
      { periodId: row.id, adRef, kind: 'spend', amountVnd: amount, agentActionId: null },
      { transaction },
    );
    await row.update({ spentVnd: row.spentVnd + amount }, { transaction });
  }
}
