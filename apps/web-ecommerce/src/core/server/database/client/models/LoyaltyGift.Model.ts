import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';
import UserModel from '../../internal/models/User.Model';

// A configured reward references real SKU stock. No illustrative gift inventory is seeded.
@Table({ tableName: 'loyalty_gift' })
export default class LoyaltyGiftModel extends Model {
  @ForeignKey(() => ProductModel) @Column({ type: DataType.INTEGER, allowNull: false }) productId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) titleEn!: string;
  @Column({ type: DataType.STRING, allowNull: false }) titleVi!: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) pointsCost!: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) isActive!: boolean;
  // Nullable for configurations retained before this audit boundary; do not invent their author.
  @ForeignKey(() => UserModel) @Column(DataType.INTEGER) createdByUserId?: number | null;
  @Column(DataType.INTEGER) policyVersion?: number | null;
  static async seedData(): Promise<void> {}
}
