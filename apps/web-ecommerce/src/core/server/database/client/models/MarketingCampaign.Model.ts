import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import AgentActionModel from './AgentAction.Model';

export type MarketingCampaignStatus = 'draft' | 'active' | 'paused' | 'ended' | 'reverted';

// A growth campaign created by the agent: it groups the discounts, coupons, posts and ads of one approved option.
// `ref` (`ag-<thread8>-<option>`) is also the `utm_campaign` of every link, so orders are attributed to it.
@Table({
  tableName: 'marketing_campaign',
})
export default class MarketingCampaignModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  ref!: string;

  // What it does, from its channels: promotion, content (posts), ads, or mixed.
  @Column({ type: DataType.STRING, allowNull: false })
  kind!: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: '' })
  name!: string;

  // The capabilities its actions use (promotion, facebook_post, ads_meta, ads_google, ads_tiktok).
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  channels!: string[];

  @Column({ type: DataType.STRING, allowNull: false })
  objective!: string;

  @Column(DataType.STRING)
  threadId?: string | null;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'draft' })
  status!: MarketingCampaignStatus;

  @Column(DataType.DATE)
  startsAt?: Date | null;

  @Column(DataType.DATE)
  endsAt?: Date | null;

  // Planned paid spend of the whole campaign (whole VND).
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  budgetVnd!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  utmCampaign!: string;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  public static async seedData(): Promise<void> {}
}
