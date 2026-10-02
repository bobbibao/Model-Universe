import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { seedAgentSettingData } from '../seeders/AgentSetting.Seeder';

// Business controls of the shop agent, edited on /admin/agent/settings (AgentSettingService): the growth goal,
// spend caps, autonomy per capability, the kill switch. One row per key; every change bumps `version` and is written
// to agent_setting_audit. The agent reads them through the `analytics.agent_settings` view.
@Table({
  tableName: 'agent_setting',
})
export default class AgentSettingModel extends Model {
  @Column({ type: DataType.STRING, primaryKey: true })
  key!: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  value!: unknown;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  version!: number;

  // The admin who last changed it; null for the defaults.
  @Column(DataType.INTEGER)
  updatedBy?: number | null;

  // The defaults (AgentSettingService.DEFAULTS), identical in every environment.
  public static async seedData(): Promise<void> {
    await seedAgentSettingData();
  }
}
