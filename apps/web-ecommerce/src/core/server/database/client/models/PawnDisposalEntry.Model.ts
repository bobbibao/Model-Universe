import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { PawnDisposalStatement } from '../../../../../shared/types/pawn-disposal';

// An allocation of a verified shop receipt is not a second external bank transaction.
@Table({ tableName: 'pawn_disposal_entry', updatedAt: false, indexes: [{ fields: ['pawnContractId', 'id'] }] })
export default class PawnDisposalEntryModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) pawnContractId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) kind!: 'sale' | 'sale_revision' | 'repayment' | 'surplus';
  @Column({ type: DataType.BIGINT, allowNull: false, get() { return Number(this.getDataValue('amountVnd')); } }) amountVnd!: number;
  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0, get() { return Number(this.getDataValue('costsVnd')); } }) costsVnd!: number;
  @Column(DataType.INTEGER) orderItemId!: number | null;
  @Column(DataType.INTEGER) receiptId!: number | null;
  @Column({ type: DataType.STRING, unique: true }) externalReference!: string | null;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  @Column(DataType.JSONB) statement!: PawnDisposalStatement | null;
  public static async seedData(): Promise<void> {}
}
