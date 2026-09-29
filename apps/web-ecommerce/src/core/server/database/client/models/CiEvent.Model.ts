import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Domain event received from the CI agent (packages/contracts/events/web-events.schema.json); the timeline
// on the improvement detail page is built from these rows.
@Table({
  tableName: 'ci_event',
  indexes: [{ fields: ['improvementId', 'occurredAt'] }],
})
export default class CiEventModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  // e.g. improvement.status_changed, question.opened, action.executed
  @Column({ type: DataType.STRING, allowNull: false })
  type!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  improvementId!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  occurredAt!: Date;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  payload!: Record<string, unknown>;

  public static async seedData(): Promise<void> {}
}
