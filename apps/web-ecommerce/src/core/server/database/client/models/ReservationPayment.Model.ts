import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import ReservationModel from './Reservation.Model';
import UserModel from '../../internal/models/User.Model';

@Table({ tableName: 'reservation_payment' })
export default class ReservationPaymentModel extends Model {
  @ForeignKey(() => ReservationModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  reservationId!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  confirmedByUserId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  amountVnd!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  externalReference!: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'receipt' })
  kind!: 'receipt' | 'refund' | 'forfeit';

  @Column({ type: DataType.TEXT, allowNull: false })
  reason!: string;
  public static async seedData(): Promise<void> {}
}
