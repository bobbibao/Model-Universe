import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import AgentActionModel from './AgentAction.Model';

export type AdPlatform = 'meta' | 'google' | 'tiktok';
export type AdStatus = 'paused' | 'active' | 'ended' | 'reverted';

// A paid ad (the platform's campaign with its ad set/group and ad) created by the web for the agent. It is created
// paused; spend is reserved in the budget ledger when it is created and released when it ends.
@Table({
  tableName: 'ad_campaign',
})
export default class AdCampaignModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  ref!: string;

  @Column(DataType.STRING)
  campaignRef?: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  platform!: AdPlatform;

  @Column(DataType.STRING)
  externalId?: string | null;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'paused' })
  status!: AdStatus;

  // Traffic first; switched to conversions by the bidding rule (docs/GROWTH_AGENT.md section 6).
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'traffic' })
  objective!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  dailyBudgetVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  totalBudgetVnd!: number;

  @Column(DataType.DATE)
  startsAt?: Date | null;

  @Column(DataType.DATE)
  endsAt?: Date | null;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  public static async seedData(): Promise<void> {}
}
