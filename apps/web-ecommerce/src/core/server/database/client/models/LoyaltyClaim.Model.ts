import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';

@Table({ tableName:'loyalty_claim' })
export default class LoyaltyClaimModel extends Model {
  @ForeignKey(() => UserModel) @Column({type:DataType.INTEGER,allowNull:false}) userId!: number;
  @Column({type:DataType.STRING,allowNull:false,defaultValue:'submitted'}) status!: 'submitted'|'approved'|'rejected';
  @Column({type:DataType.STRING,allowNull:false}) transactionReference!: string;
  @Column({type:DataType.DATE,allowNull:false}) transactionDate!: Date;
  @Column({type:DataType.INTEGER,allowNull:false}) claimedVnd!: number;
  @Column(DataType.INTEGER) recognizedVnd?: number|null;
  @Column({type:DataType.STRING,unique:true}) verifiedReference?: string|null;
  @Column(DataType.TEXT) note?: string|null;
  @Column(DataType.TEXT) reviewReason?: string|null;
  @ForeignKey(() => UserModel) @Column(DataType.INTEGER) reviewedByUserId?: number|null;
  @Column(DataType.DATE) reviewedAt?: Date|null;
  static async seedData(): Promise<void> {}
}
