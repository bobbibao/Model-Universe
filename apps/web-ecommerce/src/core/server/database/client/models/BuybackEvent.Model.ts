import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'buyback_event' })
export default class BuybackEventModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) buybackRequestId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) action!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) details!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
