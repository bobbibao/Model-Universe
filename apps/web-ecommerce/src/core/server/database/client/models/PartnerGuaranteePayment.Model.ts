import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'partner_guarantee_payment', indexes: [{ unique: true, fields: ['guaranteeId', 'kind'] }] })
export default class PartnerGuaranteePaymentModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) guaranteeId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) kind!: 'receipt' | 'refund';
  @Column({ type: DataType.INTEGER, allowNull: false }) amountVnd!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) externalReference!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) bankSnapshot!: Record<string, string>;
  public static async seedData(): Promise<void> {}
}
