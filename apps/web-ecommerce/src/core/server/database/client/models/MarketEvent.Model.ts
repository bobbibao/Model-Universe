import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedMarketEventData } from '../seeders/Market.Seeder';

// A Vietnamese retail event (Tết, 8/3, 11.11, ...) with its dates for one year. Seeded from the calendar that the
// agent also keeps (apps/agent-service/data/market/events_vn.yaml; a contract test keeps the two equal).
@Table({
  tableName: 'market_event',
  indexes: [{ unique: true, fields: ['code', 'startsOn'] }],
})
export default class MarketEventModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  code!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  startsOn!: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  endsOn!: string;

  // How many days ahead the agent plans for it.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 14 })
  leadDays!: number;

  // Our category slugs it matters most for; empty means every category.
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  categories!: string[];

  public static async seedData(): Promise<void> {
    await seedMarketEventData();
  }
}
