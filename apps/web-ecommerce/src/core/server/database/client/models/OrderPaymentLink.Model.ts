import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';

export type PaymentLinkStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'UNDERPAID' | 'PROCESSING' | 'FAILED';

// One online payment request (payOS) for an order's upfront amount (deposit or full). The provider order code is
// unique; the payment is recorded in order_prepayment only from a verified webhook or a server-side status check.
@Table({
  tableName: 'order_payment_link',
  indexes: [{ fields: ['orderId'] }, { unique: true, fields: ['providerOrderCode'] }],
})
export default class OrderPaymentLinkModel extends Model {
  @ForeignKey(() => OrderModel) @Column({ type: DataType.INTEGER, allowNull: false }) orderId!: number;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'payos' }) provider!: string;
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    get(this: OrderPaymentLinkModel) {
      return Number(this.getDataValue('providerOrderCode'));
    },
  })
  providerOrderCode!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) amountVnd!: number;
  @Column(DataType.STRING) paymentLinkId!: string | null;
  @Column(DataType.TEXT) checkoutUrl!: string | null;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'PENDING' }) status!: PaymentLinkStatus;
  @Column(DataType.DATE) expiresAt!: Date | null;
  @Column(DataType.DATE) paidAt!: Date | null;
  @Column(DataType.STRING) reference!: string | null;
  public static async seedData(): Promise<void> {}
}
