import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';

@Table({ tableName: 'commerce_notification', updatedAt: false, indexes: [{ unique: true, fields: ['dedupeKey'] }, { fields: ['userId','createdAt'] }] })
export default class CommerceNotificationModel extends Model {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;
  @Column({ type: DataType.STRING, allowNull: false })
  dedupeKey!: string;
  @Column({ type: DataType.STRING, allowNull: false })
  kind!: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  entityId!: number;
  @Column({ type: DataType.JSONB, allowNull: false })
  details!: Record<string, unknown>;
  @Column(DataType.DATE)
  readAt?: Date | null;
  public static async seedData(): Promise<void> {}
}
