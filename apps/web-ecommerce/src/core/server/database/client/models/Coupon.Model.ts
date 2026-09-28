import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedCouponData } from '../seeders/Coupon.Seeder';

@Table({
  tableName: 'coupon',
})
export default class CouponModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  // Stored upper-case.
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  code!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  title!: string;

  @Column(DataType.TEXT)
  description?: string;

  // Percentage taken off the order subtotal (1-100).
  @Column({ type: DataType.INTEGER, allowNull: false })
  discountPercent!: number;

  // Maximum number of orders that can use the coupon; null means unlimited.
  @Column(DataType.INTEGER)
  usageLimit?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  usageCount!: number;

  @Column({ type: DataType.DATE, allowNull: false })
  startDate!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  expirationDate!: Date;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  public static async seedData(): Promise<void> {
    await seedCouponData();
  }
}
