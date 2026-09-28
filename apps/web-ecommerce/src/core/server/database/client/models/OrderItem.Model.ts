import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import ProductModel from './Product.Model';

// Order line with a snapshot of the product at the time of purchase.
@Table({
  tableName: 'order_item',
})
export default class OrderItemModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => OrderModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  orderId!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  productName!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  imageUrl!: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: '' })
  size!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  unitPrice!: number;

  // Seeded together with orders (Order.Seeder).
  public static async seedData(): Promise<void> {}
}
