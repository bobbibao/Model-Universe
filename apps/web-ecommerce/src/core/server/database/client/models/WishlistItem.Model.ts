import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';
import UserModel from '../../internal/models/User.Model';

// A product (in a given size) saved by a customer.
@Table({
  tableName: 'wishlist_item',
  indexes: [{ unique: true, fields: ['userId', 'productId', 'size'] }],
})
export default class WishlistItemModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  // Empty string when the product has no sizes.
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: '' })
  size!: string;

  // Wishlists are created by customers; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
