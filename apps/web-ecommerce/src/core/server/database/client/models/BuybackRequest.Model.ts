import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { BuybackAsset, BuybackOffer, BuybackStatus } from '../../../../../shared/types/buyback';

@Table({ tableName: 'buyback_request', indexes: [{ unique: true, fields: ['userId', 'requestKey'] }, { fields: ['userId', 'createdAt'] }] })
export default class BuybackRequestModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) requestKey!: string;
  @Column({ type: DataType.STRING, allowNull: false }) requestDigest!: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'submitted' }) status!: BuybackStatus;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) version!: number;
  @Column({ type: DataType.JSONB, allowNull: false }) asset!: BuybackAsset;
  @Column(DataType.JSONB) preliminaryOffer!: BuybackOffer | null;
  @Column(DataType.JSONB) finalOffer!: BuybackOffer | null;
  @Column(DataType.STRING) inboundReference!: string | null;
  @Column(DataType.TEXT) inspection!: string | null;
  @Column(DataType.INTEGER) policyVersion!: number | null;
  @Column(DataType.DATE) ownershipTransferredAt!: Date | null;
  @Column({ type: DataType.INTEGER, unique: true }) productId!: number | null;
  @Column(DataType.JSONB) returnTerms!: { details: string; accepted: boolean; tracking: string | null } | null;
  public static async seedData(): Promise<void> {}
}
