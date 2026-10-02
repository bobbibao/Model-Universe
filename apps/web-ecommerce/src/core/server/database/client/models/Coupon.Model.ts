import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { seedCouponData } from '../seeders/Coupon.Seeder';
import AgentActionModel from './AgentAction.Model';

export type CouponSource = 'admin' | 'agent';

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

  // The order subtotal (whole VND) needed to use the coupon; 0 means no minimum.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  minOrderVnd!: number;

  // Who created it: an admin, or the agent through the Agent API.
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'admin' })
  source!: CouponSource;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  // The agent campaign it belongs to (orders using it are attributed to that campaign).
  @Column(DataType.STRING)
  campaignRef?: string | null;

  public static async seedData(): Promise<void> {
    await seedCouponData();
  }
}
