import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';
import AgentActionModel from './AgentAction.Model';

// A time-limited percentage off one product's price. The product's own `price` is never changed; the
// storefront, cart and checkout compute the effective price (see ProductDiscountService).
@Table({
  tableName: 'product_discount',
})
export default class ProductDiscountModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  // Percentage taken off the price (0 < percent <= 90).
  @Column({ type: DataType.FLOAT, allowNull: false })
  percent!: number;

  @Column({ type: DataType.DATE, allowNull: false })
  startsAt!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  endsAt!: Date;

  // Set when the discount is ended early (agent revert).
  @Column(DataType.DATE)
  revokedAt?: Date | null;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  public static async seedData(): Promise<void> {}
}
