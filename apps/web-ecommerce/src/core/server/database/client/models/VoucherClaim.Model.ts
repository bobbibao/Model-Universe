import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import CouponModel from './Coupon.Model';
import UserModel from '../../internal/models/User.Model';

// A customer saved a voucher drop to their wallet (once per voucher); only then can they use it.
@Table({ tableName: 'voucher_claim', updatedAt: false, indexes: [{ unique: true, fields: ['couponId', 'userId'] }] })
export default class VoucherClaimModel extends Model {
  @ForeignKey(() => CouponModel) @Column({ type: DataType.INTEGER, allowNull: false }) couponId!: number;
  @ForeignKey(() => UserModel) @Column({ type: DataType.INTEGER, allowNull: false }) userId!: number;
  public static async seedData(): Promise<void> {}
}
