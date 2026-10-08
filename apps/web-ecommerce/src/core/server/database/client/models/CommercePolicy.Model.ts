import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';

// Explicit staff-approved financial policy snapshots; previous versions are never updated or removed.
@Table({ tableName: 'commerce_policy', updatedAt: false, indexes: [{ unique: true, fields: ['name', 'version'] }] })
export default class CommercePolicyModel extends Model {
  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  version!: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  settings!: Record<string, unknown>;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  approvedByUserId!: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  reason!: string;

  public static async seedData(): Promise<void> {}
}
