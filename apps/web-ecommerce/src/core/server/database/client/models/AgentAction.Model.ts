import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type AgentActionStatus = 'applied' | 'reverted';

// One write received from the shop agent through the Agent API (/api/agent/v1). The table doubles as the
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

  // Audit (docs/GROWTH_AGENT.md section 4): where the write came from and what allowed it. The agent sends the
  // context in `X-Agent-Context`; the write class, approval and grant are the web's own decision.
  @Column(DataType.STRING)
  threadId?: string | null;

  @Column(DataType.STRING)
  runId?: string | null;

  @Column(DataType.STRING)
  optionId?: string | null;

  @Column(DataType.STRING)
  actionId?: string | null;

  @Column(DataType.INTEGER)
  stepNo?: number | null;

  // shop_change | protective | ingestion
  @Column(DataType.STRING)
  writeClass?: string | null;

  // grant | auto_low | protective | ingestion
  @Column(DataType.STRING)
  approvalMode?: string | null;

  // The admin who approved (the grant's subject).
  @Column(DataType.INTEGER)
  approverUserId?: number | null;

  // The approval grant's id: a grant action is used under one idempotency key only.
  @Column(DataType.STRING)
  grantJti?: string | null;

  @Column(DataType.STRING)
  riskTier?: string | null;

  @Column(DataType.STRING)
  policyVersion?: string | null;

  @Column(DataType.STRING)
  modelProfile?: string | null;

  @Column(DataType.STRING)
  promptVersion?: string | null;

  // The W3C trace id from `traceparent`.
  @Column(DataType.STRING)
  traceId?: string | null;

  // Written by the agent at runtime; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
