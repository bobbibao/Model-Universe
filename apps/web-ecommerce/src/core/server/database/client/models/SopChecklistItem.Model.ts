import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import AgentActionModel from './AgentAction.Model';

// An item the shop agent appended to a named SOP checklist (e.g. "SOP-002").
@Table({
  tableName: 'sop_checklist_item',
})
export default class SopChecklistItemModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  sopId!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  text!: string;

  @ForeignKey(() => AgentActionModel)
  @Column(DataType.INTEGER)
  agentActionId?: number | null;

  // Set when the agent reverts the action that added the item; removed items are kept for the audit trail.
  @Column(DataType.DATE)
  removedAt?: Date | null;

  public static async seedData(): Promise<void> {}
}
