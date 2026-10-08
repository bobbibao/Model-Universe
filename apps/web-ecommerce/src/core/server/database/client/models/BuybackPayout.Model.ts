import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'buyback_payout' })
export default class BuybackPayoutModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false, unique: true }) buybackRequestId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) amountVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) externalReference!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  public static async seedData(): Promise<void> {}
}
