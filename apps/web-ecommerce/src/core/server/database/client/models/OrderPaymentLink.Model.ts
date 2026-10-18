import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import CheckoutSessionModel from './CheckoutSession.Model';

export type PaymentLinkStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'UNDERPAID' | 'PROCESSING' | 'FAILED';

// One online payment request (payOS) for an upfront amount (deposit or full): of an existing order, or of a checkout
// session whose order is created once the payment is confirmed (orderId is set then). The provider order code is
// unique; the payment is recorded in order_prepayment only from a verified webhook or a server-side status check.
// The VietQR content and receiving account are kept so the checkout can show the QR itself.
@Table({
  tableName: 'order_payment_link',
  indexes: [
    { fields: ['orderId'] },
    { fields: ['checkoutSessionId'] },
    { unique: true, fields: ['providerOrderCode'] },
  ],
})
export default class OrderPaymentLinkModel extends Model {
  @ForeignKey(() => OrderModel) @Column(DataType.INTEGER) orderId!: number | null;
  @ForeignKey(() => CheckoutSessionModel) @Column(DataType.INTEGER) checkoutSessionId!: number | null;
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
  @Column(DataType.TEXT) qrCode!: string | null;
  @Column(DataType.STRING) bankBin!: string | null;
  @Column(DataType.STRING) accountNumber!: string | null;
  @Column(DataType.STRING) accountName!: string | null;
  @Column(DataType.STRING) description!: string | null;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'PENDING' }) status!: PaymentLinkStatus;
  @Column(DataType.DATE) expiresAt!: Date | null;
  @Column(DataType.DATE) paidAt!: Date | null;
  @Column(DataType.STRING) reference!: string | null;
  public static async seedData(): Promise<void> {}
}
