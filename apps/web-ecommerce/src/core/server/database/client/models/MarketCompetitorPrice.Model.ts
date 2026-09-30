import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import MarketCompetitorModel from './MarketCompetitor.Model';
import ProductModel from './Product.Model';

export type MarketDataSource = 'manual' | 'csv' | 'scraper' | 'fixture';

// One observed competitor price, matched to one of our products when known. `watch` asks the competitor-site
// collector to keep reading this URL (competitors' own storefronts only; marketplaces are never scraped).
@Table({
  tableName: 'market_competitor_price',
})
export default class MarketCompetitorPriceModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => MarketCompetitorModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  competitorId!: number;

  @ForeignKey(() => ProductModel)
  @Column(DataType.INTEGER)
  ourProductId?: number | null;

  @Column(DataType.STRING)
  url?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  watch!: boolean;

  @Column({ type: DataType.STRING, allowNull: false })
  source!: MarketDataSource;

  // The competitor's product title, at most 200 characters.
  @Column(DataType.STRING(200))
  title?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  priceVnd!: number;

  @Column({ type: DataType.DATE, allowNull: false })
  observedAt!: Date;

  // How sure the product match is (1 for a manual match).
  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 1 })
  confidence!: number;

  public static async seedData(): Promise<void> {}
}
