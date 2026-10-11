import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import UserModel from '../../internal/models/User.Model';

export type OrderPrepaymentKind = 'receipt' | 'refund';

// Verified upfront bank transfers for checkout payment plans (deposit or full payment), and their refunds when a
// prepaid order is cancelled. Append-only (immutable trigger, migration 2026-10-11-29); one receipt and at most one
// refund per order. COD balances stay in order_receipt.
@Table({
  tableName: 'order_prepayment',
  updatedAt: false,
  indexes: [{ unique: true, fields: ['orderId', 'kind'], name: 'order_prepayment_order_kind' }],
})
export default class OrderPrepaymentModel extends Model {
  @ForeignKey(() => OrderModel) @Column({ type: DataType.INTEGER, allowNull: false }) orderId!: number;
  @ForeignKey(() => UserModel) @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) kind!: OrderPrepaymentKind;
  @Column({ type: DataType.INTEGER, allowNull: false }) amountVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) externalReference!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  static async seedData(): Promise<void> {}
}
