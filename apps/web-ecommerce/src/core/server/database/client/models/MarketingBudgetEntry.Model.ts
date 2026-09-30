import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import MarketingBudgetPeriodModel from './MarketingBudgetPeriod.Model';
import AgentActionModel from './AgentAction.Model';

export type BudgetEntryKind = 'reserve' | 'release' | 'spend';

// The budget ledger: every reservation, release and reported spend, append-only.
@Table({
  tableName: 'marketing_budget_entry',
  updatedAt: false,
})
export default class MarketingBudgetEntryModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => MarketingBudgetPeriodModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  periodId!: number;

  @Column(DataType.STRING)
  adRef?: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  kind!: BudgetEntryKind;

  @Column({ type: DataType.INTEGER, allowNull: false })
  amountVnd!: number;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  public static async seedData(): Promise<void> {}
}
