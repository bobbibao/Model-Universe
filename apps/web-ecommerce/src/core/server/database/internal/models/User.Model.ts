import { Column, DataType, DefaultScope, Model, Scopes, Table } from 'sequelize-typescript';
import { seedUserData } from '../seeders/User.Seeder';

export type UserRole = 'USER' | 'ADMIN';
export type UserGender = 'M' | 'F';

// The password hash is never loaded unless the `withPassword` scope is used explicitly.
@DefaultScope(() => ({
  attributes: { exclude: ['passwordHash'] },
}))
@Scopes(() => ({
  withPassword: {},
}))
@Table({
  tableName: 'user',
})
export default class UserModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  email!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  passwordHash!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  firstName!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  lastName!: string;

  @Column(DataType.STRING)
  phone?: string;

  @Column(DataType.TEXT)
  address?: string;

  @Column(DataType.ENUM('M', 'F'))
  gender?: UserGender;

  @Column({ type: DataType.ENUM('USER', 'ADMIN'), allowNull: false, defaultValue: 'USER' })
  role!: UserRole;

  @Column(DataType.STRING)
  avatar?: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  public static async seedData(): Promise<void> {
    await seedUserData();
  }
}
