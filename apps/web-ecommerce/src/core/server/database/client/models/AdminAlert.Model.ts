import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type AdminAlertKind =
  | 'meeting_order_deposited' // ZALO-01
  | 'cod_order_deposited' // ZALO-02
  | 'shipment_created' // ZALO-03
  | 'shipment_failed' // ZALO-04
  | 'delivery_failed' // ZALO-05
  | 'meeting_change_requested';

// An operational alert for the shop's staff about one order. It is always visible in the admin (the fallback the
// specification requires when no Zalo integration is permitted); Zalo deliveries are recorded per attempt in
// notification_delivery and can be retried.
@Table({ tableName: 'admin_alert', indexes: [{ unique: true, fields: ['dedupeKey'] }, { fields: ['status', 'createdAt'] }] })
export default class AdminAlertModel extends Model {
  @Column({ type: DataType.STRING, allowNull: false }) dedupeKey!: string;
  @Column({ type: DataType.STRING, allowNull: false }) kind!: AdminAlertKind;
  @Column(DataType.INTEGER) orderId!: number | null;
  @Column({ type: DataType.STRING, allowNull: false }) title!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) content!: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'open' }) status!: 'open' | 'resolved';
  @Column(DataType.INTEGER) resolvedByUserId!: number | null;
  public static async seedData(): Promise<void> {}
}
