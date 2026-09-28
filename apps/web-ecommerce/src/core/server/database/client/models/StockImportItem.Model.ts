import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import StockImportModel from './StockImport.Model';
import ProductModel from './Product.Model';

@Table({
  tableName: 'stock_import_item',
})
export default class StockImportItemModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => StockImportModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  stockImportId!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity!: number;

  // Unit cost paid to the supplier (VND).
  @Column({ type: DataType.INTEGER, allowNull: false })
  importPrice!: number;

  // Seeded together with stock imports (StockImport.Seeder).
  public static async seedData(): Promise<void> {}
}
