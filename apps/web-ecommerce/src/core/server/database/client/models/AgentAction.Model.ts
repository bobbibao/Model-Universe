import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type AgentActionStatus = 'applied' | 'reverted';

// One write received from the CI agent through the Agent API (/api/agent/v1). The table doubles as the
// idempotency store: a key is applied at most once, and `undoData` holds what `revert` needs to compensate it.
@Table({
  tableName: 'agent_action',
})
export default class AgentActionModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  idempotencyKey!: string;

  // e.g. `pricing/discounts`, or `revert` for a compensation request.
  @Column({ type: DataType.STRING, allowNull: false })
  endpoint!: string;

  // sha256 of the endpoint and the canonical JSON body; a reused key with another hash is rejected (409).
  @Column({ type: DataType.STRING(64), allowNull: false })
  requestHash!: string;

  // The response returned the first time, replayed for retries with the same key.
  @Column({ type: DataType.JSONB, allowNull: false })
  responseBody!: { ref: string; detail: string };

  // Previous state needed to revert the action; null for actions that are not revertible (e.g. a revert).
  @Column(DataType.JSONB)
  undoData?: Record<string, unknown> | null;

  @Column({ type: DataType.ENUM('applied', 'reverted'), allowNull: false, defaultValue: 'applied' })
  status!: AgentActionStatus;

  @Column(DataType.STRING)
  revertedByKey?: string | null;

  @Column(DataType.DATE)
  revertedAt?: Date | null;

  // Written by the agent at runtime; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
