import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedMarketTrendData } from '../seeders/Market.Seeder';

// Search interest (0-100, Google Trends scale) for one keyword in Vietnam on one day, written by the agent's
// `collect` graph through `POST /market/observations`.
@Table({
  tableName: 'market_trend_point',
  indexes: [{ unique: true, fields: ['keyword', 'geo', 'date'] }],
})
export default class MarketTrendPointModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  keyword!: string;

  @Column({ type: DataType.STRING(2), allowNull: false, defaultValue: 'VN' })
  geo!: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  interest!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  source!: string;

  public static async seedData(): Promise<void> {
    await seedMarketTrendData();
  }
}
