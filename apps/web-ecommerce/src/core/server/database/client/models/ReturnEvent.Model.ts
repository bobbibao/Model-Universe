import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ReturnRequestModel from './ReturnRequest.Model';
import UserModel from '../../internal/models/User.Model';
import ProductModel from './Product.Model';

@Table({ tableName: 'return_event', updatedAt: false })
export default class ReturnEventModel extends Model {
  @ForeignKey(() => ReturnRequestModel) @Column({ type: DataType.INTEGER, allowNull: false }) returnRequestId!: number;
  @ForeignKey(() => UserModel) @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) action!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) details!: Record<string, unknown>;
  @ForeignKey(() => ProductModel) @Column(DataType.INTEGER) productId?: number | null;
  static async seedData(): Promise<void> {}
}
