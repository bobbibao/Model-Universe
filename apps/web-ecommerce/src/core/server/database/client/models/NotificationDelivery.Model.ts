import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type DeliveryChannel = 'email' | 'zalo';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

// One outbound message (an email to a customer, a Zalo message to the shop) for a customer notification or an admin
// alert. Created pending inside the business transaction and sent after it commits; failures retry a limited number
// of times (NotificationDispatchService).
@Table({
  tableName: 'notification_delivery',
  indexes: [{ fields: ['status', 'updatedAt'] }, { fields: ['sourceType', 'sourceId'] }],
})
export default class NotificationDeliveryModel extends Model {
  @Column({ type: DataType.STRING, allowNull: false }) channel!: DeliveryChannel;
  @Column({ type: DataType.STRING, allowNull: false }) sourceType!: 'customer_notification' | 'admin_alert';
  @Column({ type: DataType.INTEGER, allowNull: false }) sourceId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) recipient!: string;
  @Column({ type: DataType.STRING, allowNull: false }) subject!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) body!: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'pending' }) status!: DeliveryStatus;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) attemptCount!: number;
  @Column(DataType.STRING) providerMessageId!: string | null;
  @Column(DataType.TEXT) lastError!: string | null;
  @Column(DataType.DATE) sentAt!: Date | null;
  public static async seedData(): Promise<void> {}
}
