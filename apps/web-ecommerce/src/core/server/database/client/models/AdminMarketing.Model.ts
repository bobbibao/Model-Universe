import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { MarketingDraftInput } from '../../../../../shared/types/admin-marketing';

@Table({ tableName: 'admin_marketing_draft' })
export default class AdminMarketingModel extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  id!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  ref!: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  createdBy!: number;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'draft' })
  status!: 'draft' | 'submitted';
  @Column({ type: DataType.JSONB, allowNull: false })
  input!: MarketingDraftInput;
  public static async seedData(): Promise<void> {}
}
