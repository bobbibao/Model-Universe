import { Column, DataType, Model, Table } from 'sequelize-typescript';

// The paid-marketing budget of one month. `reservedVnd` is locked by ads that are running or scheduled, `spentVnd`
// is what the platforms reported; the row is locked (SELECT ... FOR UPDATE) whenever either changes.
@Table({
  tableName: 'marketing_budget_period',
})
export default class MarketingBudgetPeriodModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  // `YYYY-MM` in Asia/Ho_Chi_Minh.
  @Column({ type: DataType.STRING(7), allowNull: false, unique: true })
  period!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  capVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  reservedVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  spentVnd!: number;

  public static async seedData(): Promise<void> {}
}
