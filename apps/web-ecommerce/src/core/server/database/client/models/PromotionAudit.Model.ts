import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Who changed a voucher or its pricing terms, from what to what (promotion_audit_logs in the specification).
@Table({ tableName: 'promotion_audit', updatedAt: false, indexes: [{ fields: ['entityType', 'entityId'] }] })
export default class PromotionAuditModel extends Model {
  @Column(DataType.INTEGER) actorUserId!: number | null;
  @Column({ type: DataType.STRING, allowNull: false }) entityType!: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) entityId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) action!: string;
  @Column(DataType.JSONB) oldValue!: Record<string, unknown> | null;
  @Column(DataType.JSONB) newValue!: Record<string, unknown> | null;
  public static async seedData(): Promise<void> {}
}
