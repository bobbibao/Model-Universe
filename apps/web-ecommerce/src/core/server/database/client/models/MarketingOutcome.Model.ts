import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type OutcomeVerdict = 'positive' | 'negative' | 'inconclusive';

// A measured result of one agent action or campaign (`POST /marketing/outcomes`): dashboards and the autonomy ramp
// read it. Amounts are whole VND, net of discount cost and ad spend.
@Table({
  tableName: 'marketing_outcome',
})
export default class MarketingOutcomeModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  threadId!: string;

  @Column(DataType.STRING)
  campaignRef?: string | null;

  // The capability measured (promotion, facebook_post, ads_meta, ...).
  @Column({ type: DataType.STRING, allowNull: false })
  capability!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  verdict!: OutcomeVerdict;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  incrementalRevenueVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  incrementalProfitVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  spendVnd!: number;

  @Column(DataType.FLOAT)
  confidence?: number | null;

  @Column({ type: DataType.DATE, allowNull: false })
  measuredAt!: Date;

  @Column(DataType.JSONB)
  details?: Record<string, unknown> | null;

  public static async seedData(): Promise<void> {}
}
