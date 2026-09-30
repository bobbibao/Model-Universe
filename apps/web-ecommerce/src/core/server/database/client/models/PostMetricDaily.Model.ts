import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Daily insights of one Facebook post, synced by the web.
@Table({
  tableName: 'post_metric_daily',
  indexes: [{ unique: true, fields: ['postRef', 'date'] }],
})
export default class PostMetricDailyModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  postRef!: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  impressions!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  reach!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  engagements!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  clicks!: number;

  public static async seedData(): Promise<void> {}
}
