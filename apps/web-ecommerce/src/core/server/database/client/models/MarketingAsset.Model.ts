import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ProductModel from './Product.Model';

export type MarketingAssetKind = 'image' | 'video';

// Media staff uploaded for ads and posts. TikTok ads need a video; without one TikTok gets no budget.
@Table({
  tableName: 'marketing_asset',
})
export default class MarketingAssetModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  kind!: MarketingAssetKind;

  @Column({ type: DataType.STRING, allowNull: false })
  url!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  title!: string;

  @ForeignKey(() => ProductModel)
  @Column(DataType.INTEGER)
  productId?: number | null;

  @Column(DataType.INTEGER)
  uploadedBy?: number | null;

  public static async seedData(): Promise<void> {}
}
