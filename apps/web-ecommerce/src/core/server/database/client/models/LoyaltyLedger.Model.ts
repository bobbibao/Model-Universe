import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';

@Table({ tableName:'loyalty_ledger', updatedAt:false })
export default class LoyaltyLedgerModel extends Model {
  @ForeignKey(() => UserModel) @Column({type:DataType.INTEGER,allowNull:false}) userId!: number;
  @ForeignKey(() => UserModel) @Column({type:DataType.INTEGER,allowNull:false}) actorUserId!: number;
  @Column({type:DataType.STRING,allowNull:false,unique:true}) sourceReference!: string;
  @Column({type:DataType.STRING,allowNull:false}) kind!: string;
  @Column({type:DataType.INTEGER,allowNull:false}) balanceDelta!: number;
  @Column({type:DataType.INTEGER,allowNull:false,defaultValue:0}) lifetimeDelta!: number;
  @Column({type:DataType.INTEGER,allowNull:false,defaultValue:0}) usedDelta!: number;
  @Column({type:DataType.INTEGER,allowNull:false}) policyVersion!: number;
  @Column({type:DataType.TEXT,allowNull:false}) reason!: string;
  @Column({type:DataType.JSONB,allowNull:false,defaultValue:{}}) details!: Record<string,unknown>;
  static async seedData(): Promise<void> {}
}
