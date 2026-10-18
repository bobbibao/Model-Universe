import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';
import OrderModel from './Order.Model';
import type { PaymentPlan } from '../../../../../shared/payment';
import type { ShippingQuoteSnapshot } from '../../../../../shared/fulfillment';

// OPEN: waiting for the QR payment. PAID: payOS confirmed the money and the order is being created. COMPLETED: the
// order exists (orderId). EXPIRED / CANCELLED: no payment, no order. FAILED: paid but the order could not be created
// (stock or price changed): staff refund it.
export type CheckoutSessionStatus = 'OPEN' | 'PAID' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'FAILED';

// A checkout waiting for its online upfront payment. The order is created only when payOS confirms the payment; until
// then nothing is reserved. `payload` is the validated order request (cart, contact, address, plan); `shippingQuote`
// the carrier and fee the customer saw, used again when the order is created.
@Table({
  tableName: 'checkout_session',
  indexes: [{ unique: true, fields: ['userId', 'requestKey'] }, { fields: ['status', 'expiresAt'] }],
})
export default class CheckoutSessionModel extends Model {
  @ForeignKey(() => UserModel) @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.STRING(128), allowNull: false }) requestKey!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) payload!: Record<string, unknown>;
  @Column(DataType.JSONB) shippingQuote!: ShippingQuoteSnapshot | null;
  @Column(DataType.JSONB) attribution!: Record<string, unknown> | null;
  @Column(DataType.JSONB) consent!: Record<string, unknown> | null;
  @Column({ type: DataType.STRING, allowNull: false }) paymentPlan!: PaymentPlan;
  @Column(DataType.INTEGER) depositVnd!: number | null;
  @Column({ type: DataType.INTEGER, allowNull: false }) totalVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) upfrontDueVnd!: number;
  // What the deposit plan asks for this request (10% of the merchandise, at least the shipping fee).
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) depositAmountVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'OPEN' }) status!: CheckoutSessionStatus;
  @Column({ type: DataType.DATE, allowNull: false }) expiresAt!: Date;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) paidVnd!: number;
  @Column(DataType.STRING) paymentReference!: string | null;
  @ForeignKey(() => OrderModel) @Column(DataType.INTEGER) orderId!: number | null;
  @Column(DataType.TEXT) failureReason!: string | null;
  @Column(DataType.DATE) lastCheckedAt!: Date | null;
  public static async seedData(): Promise<void> {}
}
