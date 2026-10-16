import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { seedCouponData } from '../seeders/Coupon.Seeder';
import AgentActionModel from './AgentAction.Model';
import UserModel from '../../internal/models/User.Model';

export type CouponSource = 'admin' | 'agent' | 'loyalty' | 'member';
// standard: an ordinary code; member_template: the monthly member voucher terms; member: one member's monthly code.
export type CouponKind = 'standard' | 'member_template' | 'member';

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

  // Issued rewards reuse checkout validation and stock transactions, but are owned and single-use.
  @ForeignKey(() => UserModel)
  @Column(DataType.INTEGER)
  ownerUserId?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  fixedAmountVnd!: number;

  @Column(DataType.INTEGER)
  maxDiscountVnd?: number | null;

  @Column(DataType.INTEGER)
  reservedOrderId?: number | null;

  @Column(DataType.DATE)
  usedAt?: Date | null;

  @Column(DataType.JSONB)
  policySnapshot?: Record<string, unknown> | null;

  // Voucher rules 4.0 (src/shared/pricing.ts).
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'standard' })
  kind!: CouponKind;

  // Keeps the shop's profit floor (20% single product / 22% basket of the standard 10% profit).
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  profitGuard!: boolean;

  @Column(DataType.JSONB)
  eligibleSkus?: string[] | null;

  @Column(DataType.JSONB)
  excludedSkus?: string[] | null;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'any' })
  cartType!: 'any' | 'single' | 'basket';

  // Total discount the campaign may give (whole VND); null = no budget limit. Used grows with each order's discount.
  @Column(DataType.INTEGER)
  budgetVnd?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  budgetUsedVnd!: number;

  // Shown in every signed-in customer's voucher wallet (and considered by "best voucher").
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isPublic!: boolean;

  // A member code points at the template it was issued from.
  @Column(DataType.INTEGER)
  templateId?: number | null;

  // Expiry reminders already created (hours before expiry: 72, 24).
  @Column(DataType.JSONB)
  remindersSent?: number[] | null;

  public static async seedData(): Promise<void> {
    await seedCouponData();
  }
}
