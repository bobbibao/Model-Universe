import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import SupplierModel from './Supplier.Model';
import UserModel from '../../internal/models/User.Model';
import { seedStockImportData } from '../seeders/StockImport.Seeder';

// Goods receipt: stock received from a supplier.
@Table({
  tableName: 'stock_import',
})
export default class StockImportModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => SupplierModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  supplierId!: number;

  // Admin who recorded the receipt.
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  createdBy!: number;

  @Column(DataType.TEXT)
  note?: string | null;

  // Sum of quantity × import price of the lines (VND). BIGINT is returned as a string by pg, hence the getter.
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    defaultValue: 0,
    get(this: StockImportModel) {
      return Number(this.getDataValue('totalCost'));
    },
  })
  totalCost!: number;

  public static async seedData(): Promise<void> {
    await seedStockImportData();
  }
}
