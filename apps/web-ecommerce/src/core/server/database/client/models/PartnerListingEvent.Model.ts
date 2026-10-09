import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'partner_listing_event' })
export default class PartnerListingEventModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) productId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) partnerId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) actorUserId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) version!: number;
  @Column({ type: DataType.STRING, allowNull: false }) action!: string;
  @Column({ type: DataType.JSONB, allowNull: false }) details!: Record<string, unknown>;
  public static async seedData(): Promise<void> {}
}
