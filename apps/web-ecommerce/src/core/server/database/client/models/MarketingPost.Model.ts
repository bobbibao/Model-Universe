import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import AgentActionModel from './AgentAction.Model';

export type MarketingPostStatus = 'scheduled' | 'published' | 'removed' | 'failed';

// An organic post on the shop's Facebook Page, published by the web (FacebookPageClient, or the fake in development).
@Table({
  tableName: 'marketing_post',
})
export default class MarketingPostModel extends Model {
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

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'facebook' })
  platform!: string;

  // The platform's id (`fake-...` in fake mode).
  @Column(DataType.STRING)
  externalId?: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  message!: string;

  @Column(DataType.STRING)
  link?: string | null;

  @Column(DataType.STRING)
  imageUrl?: string | null;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'scheduled' })
  status!: MarketingPostStatus;

  @Column(DataType.DATE)
  scheduledAt?: Date | null;

  @Column(DataType.DATE)
  publishedAt?: Date | null;

  // Set when the post is deleted from the platform (revert).
  @Column(DataType.DATE)
  removedAt?: Date | null;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  public static async seedData(): Promise<void> {}
}
