import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';

export type PricingRecordStatus = 'DRAFT' | 'APPROVED' | 'RETIRED';

// A versioned cost profile of one shop product (v6.2 SRS: "versioned cost profile"): everything the shop pays for one
// unit besides the buy-in. Proposed by one admin, approved by another; at most one APPROVED profile per product.
// Versions are never edited after approval, only retired.
@Table({
  tableName: 'product_cost_profile',
  indexes: [{ unique: true, fields: ['productId', 'version'] }, { fields: ['productId', 'status'] }],
})
export default class ProductCostProfileModel extends Model {
  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false }) version!: number;
  // What the shop paid to import or buy back one unit; the engine uses the higher of this and the latest receipt.
  @Column({ type: DataType.INTEGER, allowNull: false }) buyInVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) repairVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) packagingVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) handlingVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) shippingSubsidyVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) fixedFeeVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) expectedReturnVnd!: number;
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'DRAFT' }) status!: PricingRecordStatus;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) proposedByUserId!: number;
  @Column(DataType.INTEGER) approvedByUserId!: number | null;
  @Column(DataType.DATE) approvedAt!: Date | null;
  @Column(DataType.INTEGER) retiredByUserId!: number | null;
  @Column(DataType.DATE) retiredAt!: Date | null;

  public static async seedData(): Promise<void> {}
}

// The unit cost a profile adds up to, with the latest receipt price when it is higher than the profile's buy-in.
export const profileUnitCostVnd = (
  profile: Pick<
    ProductCostProfileModel,
    'buyInVnd' | 'repairVnd' | 'packagingVnd' | 'handlingVnd' | 'shippingSubsidyVnd' | 'fixedFeeVnd' | 'expectedReturnVnd'
  >,
  receiptCostVnd: number,
) =>
  Math.max(profile.buyInVnd, receiptCostVnd) +
  profile.repairVnd +
  profile.packagingVnd +
  profile.handlingVnd +
  profile.shippingSubsidyVnd +
  profile.fixedFeeVnd +
  profile.expectedReturnVnd;
