import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'pawn_event' })
export default class PawnEventModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) pawnContractId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false }) action!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) details!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
