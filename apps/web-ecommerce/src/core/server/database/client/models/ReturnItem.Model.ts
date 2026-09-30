import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ReturnRequestModel from './ReturnRequest.Model';
import OrderItemModel from './OrderItem.Model';

// Fixed lists: no customer free text reaches the shop agent through these codes.
export type ReturnReason = 'wrong_size' | 'defective' | 'not_as_described' | 'changed_mind' | 'other';
export type ReturnCondition = 'new' | 'open_box' | 'damaged';

export const RETURN_REASONS: ReturnReason[] = ['wrong_size', 'defective', 'not_as_described', 'changed_mind', 'other'];
export const RETURN_CONDITIONS: ReturnCondition[] = ['new', 'open_box', 'damaged'];
// Only units in these conditions can go back into stock.
export const RESTOCKABLE_CONDITIONS: ReturnCondition[] = ['new', 'open_box'];

// One returned order line. Condition and refund are set at intake (RECEIVED).
@Table({
  tableName: 'return_item',
})
export default class ReturnItemModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => ReturnRequestModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  returnRequestId!: number;

  // Gives the product (SKU) and the unit price that caps the refund.
  @ForeignKey(() => OrderItemModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  orderItemId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity!: number;

  @Column({ type: DataType.ENUM(...RETURN_REASONS), allowNull: false })
  reason!: ReturnReason;

  @Column(DataType.ENUM(...RETURN_CONDITIONS))
  condition?: ReturnCondition | null;

  // Whole VND, between 0 and unitPrice × quantity.
  @Column(DataType.INTEGER)
  refundAmount?: number | null;

  // Set by the explicit "restock" action; a line is restocked at most once.
  @Column(DataType.DATE)
  restockedAt?: Date | null;

  // Seeded together with return requests (Return.Seeder).
  public static async seedData(): Promise<void> {}
}
