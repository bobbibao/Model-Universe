import { Column, DataType, Index, Model, Table } from 'sequelize-typescript';

// One admin's approval of a high-tier option while `approvals.high.two_person` is on: the gateway signs the grant
// only when a second, different admin approves the same option with the same bodies (`actionsHash`).
@Table({
  tableName: 'agent_approval',
  updatedAt: false,
})
export default class AgentApprovalModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Index('agent_approval_option')
  @Column({ type: DataType.STRING(64), allowNull: false })
  threadId!: string;

  @Index('agent_approval_option')
  @Column({ type: DataType.STRING(64), allowNull: false })
  optionId!: string;

  // sha256 of the option's actions (endpoint, idempotency key, body hash): an approval covers exactly these bodies.
  @Column({ type: DataType.STRING(64), allowNull: false })
  actionsHash!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  approverUserId!: number;

  declare createdAt: Date;

  public static async seedData(): Promise<void> {}
}
