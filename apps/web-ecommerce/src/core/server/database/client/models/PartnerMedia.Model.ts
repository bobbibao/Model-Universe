import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Public merchandise photos require their uploader's explicit publication consent.
@Table({ tableName: 'partner_media' })
export default class PartnerMediaModel extends Model {
  @Column({ type: DataType.INTEGER, allowNull: false }) ownerUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) url!: string;
  @Column({ type: DataType.STRING, allowNull: false }) sha256!: string;
  @Column({ type: DataType.STRING, allowNull: false }) originalName!: string;
  @Column({ type: DataType.DATE, allowNull: false }) publicationConsentAt!: Date;
  public static async seedData(): Promise<void> {}
}
