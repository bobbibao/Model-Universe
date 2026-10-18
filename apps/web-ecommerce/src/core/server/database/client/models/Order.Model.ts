import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';
import { seedOrderData } from '../seeders/Order.Seeder';
import type { PaymentPlan } from '../../../../../shared/payment';
import type { CancelRequest } from '../../../../../shared/cancellation';
import type {
  FulfillmentMethod,
  OrderMeeting,
  ShippingFeePayer,
  ShippingQuoteSnapshot,
} from '../../../../../shared/fulfillment';

export type OrderStatus = 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'COD';
export type PaymentStatus = 'PENDING' | 'PAID';

// Amounts are whole VND and computed by the server when the order is placed.
@Table({
  tableName: 'order',
  indexes: [{ unique: true, fields: ['userId', 'checkoutKey'], name: 'order_user_checkout_key' }],
})
export default class OrderModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({
    type: DataType.ENUM('PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PROCESSING',
  })
  status!: OrderStatus;

  @Column({ type: DataType.ENUM('COD'), allowNull: false, defaultValue: 'COD' })
  paymentMethod!: PaymentMethod;

  @Column({ type: DataType.ENUM('PENDING', 'PAID'), allowNull: false, defaultValue: 'PENDING' })
  paymentStatus!: PaymentStatus;

  // Retained orders keep their original settlement semantics; new orders require a verified receipt.
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  requiresCollectionConfirmation!: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false })
  subtotal!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  discount!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  shippingFee!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  tax!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  total!: number;

  // Confirmed reservation money already applied to this order; COD collects only the remainder.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  prepaidVnd!: number;

  @Column(DataType.STRING)
  paymentSource?: string | null;

  // Checkout payment plan (src/shared/payment.ts): 'full' or 'deposit'. Null for retained and reservation orders.
  @Column(DataType.STRING)
  paymentPlan?: PaymentPlan | null;

  // What must be verified as transferred before the order may ship (the deposit, or the whole total). 0 = none.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  upfrontDueVnd!: number;

  // How the customer receives the order (src/shared/fulfillment.ts). Null for retained orders placed before it existed.
  @Column(DataType.STRING)
  fulfillmentMethod?: FulfillmentMethod | null;

  // Courier COD: who pays the carrier (the shop; the fee is in the order total) and the fee quoted at checkout (the
  // waybill freezes the actual fee).
  @Column(DataType.STRING)
  shippingFeePayer?: ShippingFeePayer | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  estimatedShippingFeeVnd!: number;

  // Two-level GHN ids of orders placed before SuperAI (kept for history; no longer written).
  @Column(DataType.INTEGER)
  provinceId?: number | null;

  @Column(DataType.INTEGER)
  wardId?: number | null;

  // SuperAI area codes of the delivery address (province → district → commune; the names are in city, district, ward).
  @Column(DataType.STRING(16))
  provinceCode?: string | null;

  @Column(DataType.STRING(16))
  districtCode?: string | null;

  @Column(DataType.STRING(16))
  communeCode?: string | null;

  // The carrier checkout chose (the cheapest SuperAI quote) and the other prices it saw; the waybill uses this carrier.
  @Column(DataType.JSONB)
  shippingQuote?: ShippingQuoteSnapshot | null;

  @Column(DataType.DOUBLE)
  latitude?: number | null;

  @Column(DataType.DOUBLE)
  longitude?: number | null;

  // Why and by whom the order was cancelled (src/shared/cancellation.ts), and a customer's pending or decided
  // cancellation request (paid orders and orders with a waybill are cancelled by staff on request).
  @Column(DataType.STRING(40))
  cancelReason?: string | null;

  @Column(DataType.TEXT)
  cancelNote?: string | null;

  @Column(DataType.STRING(16))
  cancelledBy?: 'customer' | 'staff' | null;

  @Column(DataType.DATE)
  cancelledAt?: Date | null;

  @Column(DataType.JSONB)
  cancelRequest?: CancelRequest | null;

  // In-person handover ("GDTT"): the requested and confirmed appointment and its history.
  @Column(DataType.JSONB)
  meeting?: OrderMeeting | null;

  // Shown to the customer; staff enter it at an in-person handover so the order is given to the right person.
  @Column(DataType.STRING(8))
  handoverCode?: string | null;

  @Column(DataType.STRING)
  checkoutKey?: string | null;

  @Column(DataType.STRING(64))
  checkoutDigest?: string | null;

  @Column(DataType.STRING)
  couponCode?: string | null;

  @Column(DataType.JSONB)
  benefitSnapshot?: Record<string, unknown> | null;

  @Column({ type: DataType.STRING, allowNull: false })
  recipientName!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  phone!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  address!: string;

  @Column(DataType.STRING)
  ward?: string | null;

  @Column(DataType.STRING)
  district?: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  city!: string;

  @Column(DataType.TEXT)
  note?: string | null;

  // Set when the order becomes DELIVERED; the 30-day return window starts here.
  @Column(DataType.DATE)
  deliveredAt?: Date | null;

  // Attribution (last non-direct click, from the AttributionCapture cookie): which campaign brought the order.
  @Column(DataType.STRING)
  utmSource?: string | null;

  @Column(DataType.STRING)
  utmMedium?: string | null;

  // The agent's campaign ref for agent-created links.
  @Column(DataType.STRING)
  utmCampaign?: string | null;

  @Column(DataType.STRING)
  utmContent?: string | null;

  @Column(DataType.STRING)
  utmTerm?: string | null;

  // The ad platform's click id and its kind (fbclid, gclid, ttclid): server-side conversions are keyed by it.
  @Column(DataType.STRING)
  clickId?: string | null;

  @Column(DataType.STRING)
  clickIdType?: string | null;

  @Column(DataType.STRING)
  landingPath?: string | null;

  public static async seedData(): Promise<void> {
    await seedOrderData();
  }
}
