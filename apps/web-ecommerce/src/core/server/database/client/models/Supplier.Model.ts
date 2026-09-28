import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedSupplierData } from '../seeders/Supplier.Seeder';

@Table({
  tableName: 'supplier',
})
export default class SupplierModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column(DataType.STRING)
  contactName?: string;

  @Column(DataType.STRING)
  contactPhone?: string;

  @Column(DataType.STRING)
  contactEmail?: string;

  @Column(DataType.STRING)
  website?: string;

  @Column(DataType.STRING)
  logo?: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  public static async seedData(): Promise<void> {
    await seedSupplierData();
  }
}
