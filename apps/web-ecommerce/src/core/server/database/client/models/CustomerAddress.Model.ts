import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { ShippingInfo } from '../../../../../shared/types/order';
import type { DeliveryAddress } from '../../../../../shared/fulfillment';

@Table({ tableName: 'customer_address', indexes: [{ unique: true, fields: ['userId', 'requestKey'] }] })
export default class CustomerAddressModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  @Column({ type: DataType.STRING(80), allowNull: false }) label!: string;
  @Column({ type: DataType.STRING(128), allowNull: false }) requestKey!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) shipping!: ShippingInfo;
  // The structured courier address (SuperAI area codes), when the address was entered with the address picker.
  @Column(DataType.JSONB) delivery!: DeliveryAddress | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 }) version!: number;
  public static async seedData(): Promise<void> {}
}
