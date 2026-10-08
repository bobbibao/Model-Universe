import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { BuybackAsset } from '../../../../../shared/types/buyback';
import type { PawnStatus, PawnTerms } from '../../../../../shared/types/pawn';

@Table({ tableName: 'pawn_contract', indexes: [{ unique: true, fields: ['userId', 'requestKey'] }, { fields: ['userId', 'createdAt'] }, { fields: ['status', 'dueAt'] }] })
export default class PawnContractModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) requestKey!: string;
  @Column({ type: DataType.STRING, allowNull: false }) requestDigest!: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'submitted' }) status!: PawnStatus;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) version!: number;
  @Column({ type: DataType.JSONB, allowNull: false }) asset!: BuybackAsset;
  @Column(DataType.JSONB) terms!: PawnTerms | null;
  @Column({ type: DataType.STRING, unique: true }) contractReference!: string | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] }) contractEvidenceIds!: number[];
  @Column(DataType.DATE) custodyAt!: Date | null;
  @Column({ type: DataType.STRING, unique: true }) custodyReference!: string | null;
  @Column(DataType.DATE) disbursedAt!: Date | null;
  @Column(DataType.DATE) dueAt!: Date | null;
  @Column(DataType.DATE) paidAt!: Date | null;
  @Column(DataType.DATE) handbackAt!: Date | null;
  @Column(DataType.DATE) disposedAt!: Date | null;
  @Column({ type: DataType.INTEGER, unique: true }) productId!: number | null;
  @Column(DataType.JSONB) extensionRequest!: { proposedDueAt: string; reason: string } | null;
  public static async seedData(): Promise<void> {}
}
