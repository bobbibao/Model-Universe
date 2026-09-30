import { Column, DataType, Model, Table } from 'sequelize-typescript';

// One change of an agent setting: who, when, from what to what, and why (a reason is required to force autonomy).
@Table({
  tableName: 'agent_setting_audit',
  updatedAt: false,
})
export default class AgentSettingAuditModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  key!: string;

  @Column(DataType.JSONB)
  oldValue?: unknown;

  @Column({ type: DataType.JSONB, allowNull: false })
  newValue!: unknown;

  // The setting's version after this change.
  @Column({ type: DataType.INTEGER, allowNull: false })
  version!: number;

  @Column(DataType.INTEGER)
  changedBy?: number | null;

  @Column(DataType.TEXT)
  reason?: string | null;

  public static async seedData(): Promise<void> {}
}
