import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import UserModel from '../../internal/models/User.Model';

@Table({ tableName: 'commerce_evidence', updatedAt: false, indexes: [{ fields: ['ownerUserId','purpose','entityId'] }] })
export default class EvidenceModel extends Model {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  ownerUserId!: number;
  @Column({ type: DataType.STRING, allowNull: false })
  purpose!: string;
  @Column(DataType.INTEGER)
  entityId?: number | null;
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  diskKey!: string;
  @Column({ type: DataType.STRING, allowNull: false })
  originalName!: string;
  @Column({ type: DataType.STRING, allowNull: false })
  mimeType!: string;
  @Column({ type: DataType.INTEGER, allowNull: false })
  sizeBytes!: number;
  @Column({ type: DataType.STRING(64), allowNull: false })
  sha256!: string;
  public static async seedData(): Promise<void> {}
}
