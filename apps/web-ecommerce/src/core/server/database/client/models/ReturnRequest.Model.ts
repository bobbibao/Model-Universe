import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import UserModel from '../../internal/models/User.Model';
import { seedReturnData } from '../seeders/Return.Seeder';

export type ReturnStatus = 'REQUESTED' | 'RECEIVED' | 'REJECTED';

// A customer's request to return lines of a delivered order. The admin receives or rejects it once.
// Neither step changes stock or the order's amounts: stock changes only through an explicit restock of a
// received line (ReturnService.restockItem), and a refund is recorded per line, paid outside the system.
@Table({
  tableName: 'return_request',
})
export default class ReturnRequestModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => OrderModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  orderId!: number;

  // Ownership only; never exposed to the shop agent.
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.ENUM('REQUESTED', 'RECEIVED', 'REJECTED'), allowNull: false, defaultValue: 'REQUESTED' })
  status!: ReturnStatus;

  // Optional free text for the admin; not exposed to the shop agent.
  @Column(DataType.TEXT)
  customerNote?: string | null;

  // Required when rejecting.
  @Column(DataType.TEXT)
  adminNote?: string | null;

  // When the goods arrived (RECEIVED); the shop agent counts returns by this date.
  @Column(DataType.DATE)
  receivedAt?: Date | null;

  @Column(DataType.DATE)
  processedAt?: Date | null;

  @ForeignKey(() => UserModel)
  @Column(DataType.INTEGER)
  processedBy?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) resolutionVersion!: number;
  @Column(DataType.STRING) resolutionStatus?: 'pending' | 'offered' | 'accepted' | 'rejected' | 'resolved' | null;
  @Column(DataType.JSONB) resolutionTerms?: Record<string, unknown> | null;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) resolutionInventoryAllocated!: boolean;

  public static async seedData(): Promise<void> {
    await seedReturnData();
  }
}
