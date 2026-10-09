import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';
import CouponModel from './Coupon.Model';
import ProductModel from './Product.Model';

@Table({ tableName:'loyalty_redemption', indexes:[{unique:true,fields:['userId','requestKey']}] })
export default class LoyaltyRedemptionModel extends Model {
  @ForeignKey(() => UserModel) @Column({type:DataType.INTEGER,allowNull:false}) userId!: number;
  @Column({type:DataType.STRING,allowNull:false}) requestKey!: string;
  @Column({type:DataType.STRING,allowNull:false}) rewardKey!: string;
  @Column({type:DataType.INTEGER,allowNull:false}) pointsCost!: number;
  @Column({type:DataType.JSONB,allowNull:false}) rewardSnapshot!: Record<string,unknown>;
  @ForeignKey(() => CouponModel) @Column(DataType.INTEGER) couponId?: number|null;
  @ForeignKey(() => ProductModel) @Column(DataType.INTEGER) giftProductId?: number|null;
  @Column({type:DataType.STRING,allowNull:false,defaultValue:'issued'}) status!: 'issued'|'requested'|'fulfilled';
  @Column(DataType.JSONB) shipping?: Record<string,unknown>|null;
  @Column(DataType.TEXT) fulfillmentReference?: string|null;
  @ForeignKey(() => UserModel) @Column(DataType.INTEGER) fulfilledByUserId?: number|null;
  @Column(DataType.DATE) fulfilledAt?: Date|null;
  static async seedData(): Promise<void> {}
}
