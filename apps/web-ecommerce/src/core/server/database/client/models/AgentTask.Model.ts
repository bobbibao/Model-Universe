import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import AgentActionModel from './AgentAction.Model';

export type AgentTaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';

// A task the agent created for staff (e.g. "arrange donation pickup"); shown on /admin/agent/tasks.
@Table({
  tableName: 'agent_task',
})
export default class AgentTaskModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  title!: string;

  // Free-form role name from the agent (merchandiser, warehouse, logistics, ...).
  @Column({ type: DataType.STRING, allowNull: false })
  assigneeRole!: string;

  @Column(DataType.TEXT)
  description?: string | null;

  @Column(DataType.DATE)
  dueAt?: Date | null;

  @Column({ type: DataType.ENUM('OPEN', 'DONE', 'CANCELLED'), allowNull: false, defaultValue: 'OPEN' })
  status!: AgentTaskStatus;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  public static async seedData(): Promise<void> {}
}
