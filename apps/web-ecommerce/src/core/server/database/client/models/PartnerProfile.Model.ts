import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { PartnerApplication, PartnerStatus } from '../../../../../shared/types/partner';

@Table({ tableName: 'partner_profile', indexes: [{ unique: true, fields: ['userId'] }] })
export default class PartnerProfileModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) requestKey!: string;
  @Column({ type: DataType.STRING, allowNull: false }) requestDigest!: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'submitted' }) status!: PartnerStatus;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 }) version!: number;
  @Column({ type: DataType.JSONB, allowNull: false }) application!: PartnerApplication;
  @Column({ type: DataType.JSONB, allowNull: false }) currentEvidenceIds!: number[];
  @Column(DataType.DATE) identityVerifiedAt!: Date | null;
  @Column(DataType.DATE) bankVerifiedAt!: Date | null;
  @Column(DataType.JSONB) pendingBankChange!: import('../../../../../shared/types/partner').PartnerProfile['pendingBankChange'];
  @Column(DataType.INTEGER) maxListings!: number | null;
  @Column(DataType.INTEGER) maxListingValueVnd!: number | null;
  public static async seedData(): Promise<void> {}
}
