import { Column, DataType, Model, Table } from 'sequelize-typescript';

// The nightly promotion reconciliation of one Vietnam day (v6.2 SRS non-functional targets): redeemed vouchers, rank
// benefits, free shipping, points earned and reversed, the points liability, and the problems found. One row per day;
// a rerun of the same day changes nothing.
@Table({ tableName: 'promotion_reconciliation', updatedAt: false, indexes: [{ unique: true, fields: ['day'] }] })
export default class PromotionReconciliationModel extends Model {
  @Column({ type: DataType.STRING(10), allowNull: false }) day!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) report!: Record<string, unknown>;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) problemCount!: number;

  public static async seedData(): Promise<void> {}
}
