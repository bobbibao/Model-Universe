import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'restock_subscription', indexes: [{ unique: true, fields: ['userId', 'productId'] }, { fields: ['active', 'id'] }] })
export default class RestockSubscriptionModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) productId!: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) active!: boolean;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 }) cycle!: number;
  @Column(DataType.DATE) notifiedAt!: Date | null;
  public static async seedData(): Promise<void> {}
}
