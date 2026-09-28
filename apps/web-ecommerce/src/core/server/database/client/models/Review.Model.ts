import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';
import UserModel from '../../internal/models/User.Model';
import { seedReviewData } from '../seeders/Review.Seeder';

@Table({
  tableName: 'review',
})
export default class ReviewModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  rating!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  title!: string;

  @Column(DataType.TEXT)
  content?: string;

  @Column(DataType.STRING)
  location?: string;

  public static async seedData(): Promise<void> {
    await seedReviewData();
  }
}
