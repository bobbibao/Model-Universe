import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';

export const IMAGE_STATUSES = ['verified', 'reference', 'placeholder'] as const;
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

// Where a catalog product's identity, image and price came from (seeders/data/model-universe-catalog.json). Staff-only
// provenance: the storefront never reads it. One row per product imported from the catalog; `catalogKey` keeps
// re-imports idempotent.
@Table({
  tableName: 'product_source',
})
export default class ProductSourceModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false, unique: true })
  productId!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  catalogKey!: string;

  // The manufacturer's code as printed on the box (also Product.modelCode); null when not verified.
  @Column(DataType.STRING)
  manufacturerSku?: string | null;

  @Column(DataType.STRING)
  variantName?: string | null;

  @Column(DataType.STRING)
  productType?: string | null;

  // verified: the image matches the model and variant; reference: same model, variant unconfirmed;
  // placeholder: no real image found yet.
  @Column({ type: DataType.ENUM(...IMAGE_STATUSES), allowNull: false })
  imageStatus!: ImageStatus;

  @Column(DataType.TEXT)
  imageSourceUrl?: string | null;

  @Column(DataType.TEXT)
  imageSearchUrl?: string | null;

  // A retailer's own SKU (e.g. Newtype), never the manufacturer's code.
  @Column(DataType.STRING)
  retailerSku?: string | null;

  @Column(DataType.STRING)
  verification?: string | null;

  @Column(DataType.TEXT)
  sourceUrl?: string | null;

  // How the seeded list price was estimated (retailer listing and conversion).
  @Column(DataType.TEXT)
  priceSource?: string | null;

  @Column(DataType.TEXT)
  notes?: string | null;

  // Seeded together with products (Product.Seeder).
  public static async seedData(): Promise<void> {}
}
