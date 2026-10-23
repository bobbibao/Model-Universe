import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';
import type { PricingRecordStatus } from './ProductCostProfile.Model';

// An approved list price R of one shop product, with the proof that it is really published (v6.2 SRS: "approved R with
// proof and version"; R is never approved by algebra alone). Proposed by one admin, approved by another; at most one
// APPROVED record per product, and it counts only while the product's price still equals it.
@Table({
  tableName: 'product_price_approval',
  indexes: [{ unique: true, fields: ['productId', 'version'] }, { fields: ['productId', 'status'] }],
})
export default class ProductPriceApprovalModel extends Model {
  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false }) version!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) listPriceVnd!: number;
  @Column(DataType.INTEGER) referenceMemberVnd!: number | null;
  // Where the price is published or was sold (a listing, an invoice, a receipt number).
  @Column({ type: DataType.TEXT, allowNull: false }) proof!: string;
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'DRAFT' }) status!: PricingRecordStatus;
  @Column({ type: DataType.TEXT, allowNull: false }) reason!: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) proposedByUserId!: number;
  @Column(DataType.INTEGER) approvedByUserId!: number | null;
  @Column(DataType.DATE) approvedAt!: Date | null;
  @Column(DataType.INTEGER) retiredByUserId!: number | null;
  @Column(DataType.DATE) retiredAt!: Date | null;

  public static async seedData(): Promise<void> {}
}
