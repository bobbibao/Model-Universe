import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';
import ProductModel from './Product.Model';
import OrderModel from './Order.Model';
import type { ReservationStatus } from '../../../../../shared/reservation';

@Table({ tableName: 'reservation', indexes: [{ fields: ['userId', 'createdAt'] }, { unique: true, fields: ['userId', 'requestKey'] }, { fields: ['status', 'expiresAt'] }] })
export default class ReservationModel extends Model {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => ProductModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  productId!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  productName!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  imageUrl!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  unitPriceVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  totalVnd!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  paidVnd!: number;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'awaiting_payment' })
  status!: ReservationStatus;

  @Column(DataType.DATE)
  startedAt?: Date | null;

  @Column(DataType.DATE)
  expiresAt?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  extensionDays!: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  inventoryAllocated!: boolean;

  @Column({ type: DataType.JSONB })
  shipping?: Record<string, unknown> | null;

  @Column(DataType.STRING)
  deliveryMethod?: 'delivery' | 'pickup' | null;

  @ForeignKey(() => OrderModel)
  @Column({ type: DataType.INTEGER, unique: true })
  orderId?: number | null;

  @Column({ type: DataType.STRING, allowNull: false })
  requestKey!: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  policyVersion!: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  modelSnapshot!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
