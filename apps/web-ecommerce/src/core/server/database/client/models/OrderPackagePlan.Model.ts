import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import UserModel from '../../internal/models/User.Model';
import type { PackagePlanSnapshot } from '../../../../../shared/packing/plan';
import type { PlanProblem } from '../../../../../shared/packing/optimizer';

export const PACKAGE_PLAN_STATUSES = ['PROPOSED', 'CONFIRMED', 'SUPERSEDED'] as const;
export type PackagePlanStatus = (typeof PACKAGE_PLAN_STATUSES)[number];

// How an order is packed: the package optimizer's plan (or staff's revision of it), one row per version. A version
// never changes; a new plan supersedes the previous one. Waybills point at the plan and parcel they carry.
@Table({ tableName: 'order_package_plan', indexes: [{ unique: true, fields: ['orderId', 'version'] }] })
export default class OrderPackagePlanModel extends Model {
  @ForeignKey(() => OrderModel) @Column({ type: DataType.INTEGER, allowNull: false }) orderId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) version!: number;
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'PROPOSED' }) status!: PackagePlanStatus;
  // The plan; null when the order needs staff to decide (`problem`).
  @Column(DataType.JSONB) plan!: PackagePlanSnapshot | null;
  @Column(DataType.JSONB) problem!: PlanProblem | null;
  // The next cheapest plans, so staff see what was weighed.
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] }) alternatives!: PackagePlanSnapshot[];
  // Products packed with an estimated size (grade or fallback box) rather than their own.
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] }) estimatedProductIds!: number[];
  // The delivery fee the customer paid for this order, to show what a revised plan costs the shop.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) chargedFeeVnd!: number;
  @Column({ type: DataType.STRING(64), allowNull: false }) inputsDigest!: string;
  // Null for the automatic plan.
  @ForeignKey(() => UserModel) @Column(DataType.INTEGER) createdByUserId!: number | null;
  @Column(DataType.TEXT) note!: string | null;
  public static async seedData(): Promise<void> {}
}
