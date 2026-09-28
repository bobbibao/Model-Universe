import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type EmailVerificationPurpose = 'REGISTER' | 'RESET_PASSWORD';

// One-time codes sent by email; only a hash of the code is stored.
@Table({
  tableName: 'email_verification',
})
export default class EmailVerificationModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  email!: string;

  @Column({ type: DataType.ENUM('REGISTER', 'RESET_PASSWORD'), allowNull: false })
  purpose!: EmailVerificationPurpose;

  @Column({ type: DataType.STRING, allowNull: false })
  otpHash!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  attempts!: number;

  @Column(DataType.DATE)
  verifiedAt?: Date;

  // Codes are created at runtime; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
