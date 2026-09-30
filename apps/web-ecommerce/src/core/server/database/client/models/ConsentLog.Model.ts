import { Column, DataType, Model, Table } from 'sequelize-typescript';

// A visitor's cookie choice (ConsentBanner): the choice and its time only, no identifier or personal data. Kept as
// evidence that tracking tags ran only after consent (Decree 13/2023/ND-CP).
@Table({
  tableName: 'consent_log',
  updatedAt: false,
})
export default class ConsentLogModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  analytics!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  marketing!: boolean;

  public static async seedData(): Promise<void> {}
}
