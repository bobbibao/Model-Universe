import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import MarketCompetitorModel from './MarketCompetitor.Model';
import type { MarketDataSource } from './MarketCompetitorPrice.Model';

// A promotion a competitor runs (e.g. "giảm 30% áo khoác"), entered by hand, from the CSV or by the collector.
@Table({
  tableName: 'market_competitor_campaign',
})
export default class MarketCompetitorCampaignModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => MarketCompetitorModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  competitorId!: number;

  @Column({ type: DataType.STRING(200), allowNull: false })
  title!: string;

  // Our category slug it competes with, when known.
  @Column(DataType.STRING)
  category?: string | null;

  @Column(DataType.FLOAT)
  discountPct?: number | null;

  @Column(DataType.DATE)
  startsAt?: Date | null;

  @Column(DataType.DATE)
  endsAt?: Date | null;

  @Column(DataType.STRING)
  url?: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  source!: MarketDataSource;

  @Column({ type: DataType.DATE, allowNull: false })
  observedAt!: Date;

  public static async seedData(): Promise<void> {}
}
