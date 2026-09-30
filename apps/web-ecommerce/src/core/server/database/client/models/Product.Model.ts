import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import CategoryModel from './Category.Model';
import SupplierModel from './Supplier.Model';
import { seedProductData } from '../seeders/Product.Seeder';

export type ProductGender = 'male' | 'female' | 'unisex';
// Set by the shop agent's inventory adjustments. Anything but `available` is hidden from the storefront.
export type InventoryStatus = 'available' | 'quarantine' | 'donation_pending' | 'recycle';
export type SalesChannel = 'web' | 'outlet';

export const INVENTORY_STATUSES: InventoryStatus[] = ['available', 'quarantine', 'donation_pending', 'recycle'];
export const SALES_CHANNELS: SalesChannel[] = ['web', 'outlet'];

// Storefront visibility, shared by every public query: not discontinued and not held back by an adjustment.
export const STOREFRONT_VISIBLE = { isArchived: false, inventoryStatus: 'available' } as const;

export const isSellable = (product: Pick<ProductModel, 'isArchived' | 'inventoryStatus'>): boolean =>
  !product.isArchived && product.inventoryStatus === 'available';

@Table({
  tableName: 'product',
})
export default class ProductModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  sku!: string;

  @Column(DataType.TEXT)
  description?: string;

  @Column({ type: DataType.STRING, allowNull: false })
  brandName!: string;

  @Column({ type: DataType.ENUM('male', 'female', 'unisex'), allowNull: false, defaultValue: 'unisex' })
  gender!: ProductGender;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  availableSizes!: string[];

  // Prices are whole VND amounts.
  @Column({ type: DataType.INTEGER, allowNull: false })
  price!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  importPrice!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  stock!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  sold!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  imageUrl!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isFeatured!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isArchived!: boolean;

  @Column({ type: DataType.ENUM(...INVENTORY_STATUSES), allowNull: false, defaultValue: 'available' })
  inventoryStatus!: InventoryStatus;

  // Outlet products are still sold on the storefront, with an "Outlet" badge and their own filter.
  @Column({ type: DataType.ENUM(...SALES_CHANNELS), allowNull: false, defaultValue: 'web' })
  salesChannel!: SalesChannel;

  @Column(DataType.DATE)
  productionDate?: Date;

  // Average review rating, kept in sync by the review logic.
  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
  rating!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  reviewCount!: number;

  @Column(DataType.STRING)
  weight?: string;

  @Column(DataType.STRING)
  dimensions?: string;

  @ForeignKey(() => CategoryModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  categoryId!: number;

  @ForeignKey(() => SupplierModel)
  @Column(DataType.INTEGER)
  supplierId?: number;

  public static async seedData(): Promise<void> {
    await seedProductData();
  }
}
