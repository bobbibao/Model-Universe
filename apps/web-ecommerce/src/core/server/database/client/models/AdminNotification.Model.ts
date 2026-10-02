import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

// An email to every admin about the agent (MailService.sendNotification): protective actions, overspend, the agent's
// own notices. Also the daily cap (20) and the once-a-day dedupe key.
@Table({
  tableName: 'admin_notification',
  updatedAt: false,
})
export default class AdminNotificationModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  subject!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  message!: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'info' })
  severity!: NotificationSeverity;

  @Column(DataType.STRING)
  dedupeKey?: string | null;

  // How many admins it was sent to (0 when SMTP is not configured: it is logged instead).
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  recipients!: number;

  declare createdAt: Date;

  public static async seedData(): Promise<void> {}
}
