import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'pawn_payment', indexes: [{ unique: true, fields: ['pawnContractId'], where: { kind: 'disbursement' } }] })
export default class PawnPaymentModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) pawnContractId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) kind!: 'disbursement' | 'redemption';
  @Column({ type: DataType.BIGINT, allowNull: false }) amountVnd!: number;
  @Column({ type: DataType.BIGINT, allowNull: false }) principalVnd!: number;
  @Column({ type: DataType.BIGINT, allowNull: false }) interestVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) externalReference!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  public static async seedData(): Promise<void> {}
}
