import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import UserModel from '../../internal/models/User.Model';
import type { PackageSpec, ShipmentStatus, ShippingFeePayer } from '../../../../../shared/fulfillment';

export type CarrierMode = 'live' | 'simulate' | 'fake' | 'manual';

// One carrier waybill for an order's delivery, booked through SuperAI with the chosen carrier (earlier rows may be GHN
// or SPX directly). At most one active waybill per order (partial unique index, migration 2026-10-16-31); a cancelled or returned one may be followed by a new waybill. Amounts are whole VND and
// frozen when the waybill is created: the COD the carrier collects never changes afterwards.
@Table({ tableName: 'order_shipment', indexes: [{ fields: ['orderId'] }, { unique: true, fields: ['requestKey'] }] })
export default class OrderShipmentModel extends Model {
  @ForeignKey(() => OrderModel) @Column({ type: DataType.INTEGER, allowNull: false }) orderId!: number;
  // Null when the waybill was created automatically after a verified online payment.
  @ForeignKey(() => UserModel) @Column(DataType.INTEGER) createdByUserId!: number | null;
  // SUPERAI for waybills booked through SuperAI (GHN or SPX for earlier ones); the real carrier is carrierName.
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'SUPERAI' }) carrier!: string;
  @Column(DataType.INTEGER) carrierId!: number | null;
  @Column(DataType.STRING) carrierName!: string | null;
  // The carrier's own waybill code (null for a few minutes after SuperAI accepts the order).
  @Column(DataType.STRING) carrierCode!: string | null;
  @Column({ type: DataType.STRING, allowNull: false }) mode!: CarrierMode;
  @Column({ type: DataType.STRING, allowNull: false }) requestKey!: string;
  @Column(DataType.STRING) carrierOrderId!: string | null;
  @Column({ type: DataType.STRING, unique: true }) trackingNumber!: string | null;
  @Column(DataType.STRING) trackingUrl!: string | null;
  @Column({ type: DataType.JSONB, allowNull: false }) recipientSnapshot!: Record<string, unknown>;
  @Column({ type: DataType.JSONB, allowNull: false }) packageSnapshot!: PackageSpec;
  @Column({ type: DataType.INTEGER, allowNull: false }) shippingFeeVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false }) feePayer!: ShippingFeePayer;
  // Product balance + (fee when the customer pays it on delivery), computed from verified payments only.
  @Column({ type: DataType.INTEGER, allowNull: false }) codAmountVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) productBalanceVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'CREATED' }) status!: ShipmentStatus;
  @Column(DataType.TEXT) failureReason!: string | null;
  // The carrier's latest status code (SuperAI: 2 Chờ Lấy Hàng, 11 Đang Giao Hàng, ...) and its delivery estimate.
  @Column(DataType.STRING) carrierStatus!: string | null;
  @Column(DataType.DATE) expectedDeliveryAt!: Date | null;
  @Column(DataType.DATE) lastSyncedAt!: Date | null;
  public static async seedData(): Promise<void> {}
}
