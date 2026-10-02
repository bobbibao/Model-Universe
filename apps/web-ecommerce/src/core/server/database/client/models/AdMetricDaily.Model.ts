import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Daily delivery of one ad, synced from its platform by the web (`POST /marketing/metrics/sync`). Amounts in VND.
@Table({
  tableName: 'ad_metric_daily',
  indexes: [{ unique: true, fields: ['adRef', 'date'] }],
})
export default class AdMetricDailyModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  adRef!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  platform!: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  impressions!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  clicks!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  spendVnd!: number;

  // Purchases the platform attributes to the ad, and their value.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  conversions!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  conversionValueVnd!: number;

  public static async seedData(): Promise<void> {}
}
