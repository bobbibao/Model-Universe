import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderShipmentModel from './OrderShipment.Model';
import type { ShipmentStatus } from '../../../../../shared/fulfillment';

// Every carrier status event as received (webhook, fake simulator or a staff entry for manual waybills). The provider
// event id is unique, so a repeated webhook is recorded once and notifies once.
@Table({
  tableName: 'order_shipment_event',
  updatedAt: false,
  indexes: [{ unique: true, fields: ['providerEventId'] }, { fields: ['shipmentId'] }],
})
export default class OrderShipmentEventModel extends Model {
  @ForeignKey(() => OrderShipmentModel) @Column({ type: DataType.INTEGER, allowNull: false }) shipmentId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) providerEventId!: string;
  @Column({ type: DataType.STRING, allowNull: false }) status!: ShipmentStatus;
  // Whether the event changed the shipment (false: repeated or out of order).
  @Column({ type: DataType.BOOLEAN, allowNull: false }) applied!: boolean;
  @Column(DataType.TEXT) reason!: string | null;
  @Column(DataType.INTEGER) actorUserId!: number | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} }) details!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
