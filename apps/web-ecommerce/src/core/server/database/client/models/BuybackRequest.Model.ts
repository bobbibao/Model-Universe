import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { BuybackAsset, BuybackOffer, BuybackStatus } from '../../../../../shared/types/buyback';
import type { BuybackEstimate, BuybackIssue, InspectionComparison } from '../../../../../shared/buyback-pricing';

@Table({
  tableName: 'buyback_request',
  indexes: [{ unique: true, fields: ['userId', 'requestKey'] }, { fields: ['userId', 'createdAt'] }],
})
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
  // Buyback pricing 2.0: the catalog product used as the reference price, the customer's declared issues and the
  // estimate computed from them, then the inspected issues and the two-way comparison.
  @Column(DataType.INTEGER) referenceProductId!: number | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] }) declaredIssues!: BuybackIssue[];
  @Column(DataType.JSONB) estimate!: BuybackEstimate | null;
  @Column(DataType.JSONB) inspectedIssues!: BuybackIssue[] | null;
  @Column(DataType.JSONB) comparison!: InspectionComparison | null;
  // What staff asked the customer to add (need_more_evidence) and why the customer asked for a re-inspection.
  @Column(DataType.TEXT) evidenceRequest!: string | null;
  @Column(DataType.TEXT) reviewRequest!: string | null;
  @Column(DataType.JSONB) returnTerms!: { details: string; accepted: boolean; tracking: string | null } | null;
  public static async seedData(): Promise<void> {}
}
