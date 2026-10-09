import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import OrderModel from './Order.Model';
import UserModel from '../../internal/models/User.Model';

// A verified payout, distinct from a proposed refund entered during return inspection.
@Table({tableName:'order_refund',updatedAt:false})
export default class OrderRefundModel extends Model {
  @ForeignKey(() => OrderModel) @Column({type:DataType.INTEGER,allowNull:false}) orderId!: number;
  @ForeignKey(() => UserModel) @Column({type:DataType.INTEGER,allowNull:false}) actorUserId!: number;
  @Column({type:DataType.STRING,allowNull:false,unique:true}) externalReference!: string;
  @Column({type:DataType.INTEGER,allowNull:false}) merchandiseVnd!: number;
  @Column({type:DataType.INTEGER,allowNull:false,defaultValue:0}) shippingVnd!: number;
  @Column({type:DataType.INTEGER,allowNull:false,defaultValue:0}) taxVnd!: number;
  @Column({type:DataType.TEXT,allowNull:false}) reason!: string;
  // Retained refunds stay unallocated; new pawn-source refunds require exact line totals.
  @Column(DataType.JSONB) lineRefunds!: { orderItemId: number; merchandiseVnd: number }[] | null;
  static async seedData(): Promise<void> {}
}
