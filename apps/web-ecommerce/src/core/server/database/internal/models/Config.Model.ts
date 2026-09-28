import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'config',
})
export default class ConfigModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column(DataType.STRING)
  configKey!: string;

  @Column(DataType.TEXT)
  configValue!: string;

  // Config entries are managed by the application; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
