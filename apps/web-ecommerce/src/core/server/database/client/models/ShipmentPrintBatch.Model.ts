import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';

export const LABEL_SIZES = ['A6', '100x150', 'A4'] as const;
export type LabelSize = (typeof LABEL_SIZES)[number];

// One print run of shipping labels (usually the end-of-day batch): which waybills, who printed them, at what size.
// Kept for the record: a label printed twice is visible, and any batch can be downloaded again.
@Table({ tableName: 'shipment_print_batch', indexes: [{ fields: ['createdAt'] }] })
export default class ShipmentPrintBatchModel extends Model {
  @ForeignKey(() => UserModel) @Column({ type: DataType.INTEGER, allowNull: false }) createdByUserId!: number;
  @Column({ type: DataType.JSONB, allowNull: false }) shipmentIds!: number[];
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'A6' }) size!: LabelSize;
  @Column({ type: DataType.INTEGER, allowNull: false }) labelCount!: number;
  // How many of the labels had been printed before (a reprint).
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) reprintCount!: number;
  public static async seedData(): Promise<void> {}
}
