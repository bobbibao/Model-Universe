import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'sale_campaign' })
export default class SaleCampaignModel extends Model {
  @Column({ type: DataType.STRING, unique: true, allowNull: false }) key!: string;
  @Column({ type: DataType.STRING, allowNull: false }) title!: string;
  @Column(DataType.TEXT) description!: string | null;
  @Column({ type: DataType.STRING, allowNull: false }) kind!: 'manual' | 'weekly' | 'weekly_rule';
  @Column({ type: DataType.DATE, allowNull: false }) startsAt!: Date;
  @Column(DataType.DATE) endsAt!: Date | null;
  @Column(DataType.DATE) revokedAt!: Date | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} }) settings!: Record<string, unknown>;
  @Column(DataType.INTEGER) createdByUserId!: number | null;
  public static async seedData(): Promise<void> {}
}
