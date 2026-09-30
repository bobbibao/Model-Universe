import { Column, DataType, Model, Table } from 'sequelize-typescript';

// In-app notification delivered by the CI agent (`notification.created` event on /api/agent/v1/events).
@Table({
  tableName: 'ci_notification',
})
export default class CiNotificationModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  // The agent's notification id; unique so a redelivered event is stored once.
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  notificationId!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  improvementId!: string;

  // question | auto_approved | action_executed | action_failed | measurement_ready | question_expired | case_learned
  @Column({ type: DataType.STRING, allowNull: false })
  kind!: string;

  // The agent's recipient id, which is the web user id.
  @Column({ type: DataType.STRING, allowNull: false })
  recipientId!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  body!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  severity!: string;

  @Column(DataType.STRING)
  questionId?: string | null;

  @Column(DataType.STRING)
  linkPath?: string | null;

  @Column(DataType.DATE)
  readAt?: Date | null;

  public static async seedData(): Promise<void> {}
}
