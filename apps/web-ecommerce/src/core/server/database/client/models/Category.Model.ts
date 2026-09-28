import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedCategoryData } from '../seeders/Category.Seeder';

@Table({
  tableName: 'category',
})
export default class CategoryModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  slug!: string;

  public static async seedData(): Promise<void> {
    await seedCategoryData();
  }
}
