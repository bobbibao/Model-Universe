import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { ShippingInfo } from '../../../../../shared/types/order';

@Table({ tableName: 'customer_address', indexes: [{ unique: true, fields: ['userId', 'requestKey'] }] })
export default class CustomerAddressModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.STRING(80), allowNull: false }) label!: string;
  @Column({ type: DataType.STRING(128), allowNull: false }) requestKey!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) shipping!: ShippingInfo;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 }) version!: number;
  public static async seedData(): Promise<void> {}
}
