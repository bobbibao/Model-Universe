import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedMarketCompetitorData } from '../seeders/Market.Seeder';

// A direct competitor, entered by an admin on /admin/agent/market.
@Table({
  tableName: 'market_competitor',
})
export default class MarketCompetitorModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  name!: string;

  // Its own storefront (never a marketplace page).
  @Column(DataType.STRING)
  website?: string | null;

  @Column(DataType.TEXT)
  notes?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  // Development seed: fictional competitors with prices and campaigns (Market.Seeder).
  public static async seedData(): Promise<void> {
    await seedMarketCompetitorData();
  }
}
