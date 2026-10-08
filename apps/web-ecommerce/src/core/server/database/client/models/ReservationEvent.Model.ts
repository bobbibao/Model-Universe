import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ReservationModel from './Reservation.Model';
import UserModel from '../../internal/models/User.Model';

@Table({ tableName: 'reservation_event' })
export default class ReservationEventModel extends Model {
  @ForeignKey(() => ReservationModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  reservationId!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  actorUserId!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  action!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  reason!: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  details!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
