import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type ContactMessageStatus = 'NEW' | 'HANDLED';

// Message sent through the storefront contact form.
@Table({
  tableName: 'contact_message',
})
export default class ContactMessageModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  email!: string;

  @Column(DataType.STRING)
  phone?: string | null;

  @Column(DataType.STRING)
  company?: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  message!: string;

  @Column({ type: DataType.ENUM('NEW', 'HANDLED'), allowNull: false, defaultValue: 'NEW' })
  status!: ContactMessageStatus;

  // Messages come from visitors; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
