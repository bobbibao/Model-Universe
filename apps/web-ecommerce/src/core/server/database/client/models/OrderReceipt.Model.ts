import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import UserModel from '../../internal/models/User.Model';

// Confirmed cash/courier remittance, separate from delivery and reservation deposits.
@Table({ tableName: 'order_receipt', updatedAt: false })
export default class OrderReceiptModel extends Model {
  @ForeignKey(() => OrderModel) @Column({ type: DataType.INTEGER, allowNull: false, unique: true }) orderId!: number;
  @ForeignKey(() => UserModel) @Column({ type: DataType.INTEGER, allowNull: false }) confirmedByUserId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) amountVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) externalReference!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  static async seedData(): Promise<void> {}
}
