import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Accepted terms remain immutable even when the seller, price or policy later changes.
@Table({ tableName: 'partner_guarantee', indexes: [{ unique: true, fields: ['productId', 'listingVersion'] }] })
export default class PartnerGuaranteeModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) productId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) partnerId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) listingVersion!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) productValueVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) requiredVnd!: number;
  @Column({ type: DataType.JSONB, allowNull: false }) terms!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
