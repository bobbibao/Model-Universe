import { FindOptions, Op, WhereOptions } from 'sequelize';
import UserModel, { UserRole } from '../database/internal/models/User.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isNonEmpty, isValidPhone } from '../../../shared/server/utils/ValidationUtils';
import type { AuthUser } from '../../../shared/server/types/express';

export interface UserListQuery {
  q?: string;
  role?: string;
  limit: number;
  offset: number;
  sortKey?: string;
  sortDirection?: string;
}

const SORTABLE_COLUMNS = ['id', 'email', 'firstName', 'lastName', 'createdAt'];
const ROLES: UserRole[] = ['USER', 'ADMIN'];
const MIN_ADDRESS_LENGTH = 4;

// Plain user data without the password hash (the default scope already excludes it).
export const toPublicUser = (user: UserModel): AuthUser => {
  const publicUser = user.get({ plain: true });
  delete publicUser.passwordHash;
  return publicUser as AuthUser;
};

export default class UserService implements BaseServiceInterface<UserModel> {
  findByPk(id: string | number): Promise<UserModel | null> {
    return UserModel.findByPk(id);
  }

  findAll(filter?: FindOptions): Promise<UserModel[]> {
    return UserModel.findAll(filter);
  }

  // Accounts are created through AuthService.register so that passwords are always hashed.
  insert(): Promise<UserModel | null> {
    throw new Error('Use AuthService.register to create users.');
  }

  bulkInsert(): Promise<UserModel[] | null> {
    throw new Error('Use AuthService.register to create users.');
  }

  async list({ q, role, limit, offset, sortKey, sortDirection }: UserListQuery) {
    const where: WhereOptions = {};
    const search = asTrimmedString(q);
    if (search) {
      Object.assign(where, {
        [Op.or]: ['email', 'firstName', 'lastName', 'phone'].map((column) => ({
          [column]: { [Op.iLike]: `%${search}%` },
        })),
      });
    }
    if (role && ROLES.includes(role as UserRole)) {
      Object.assign(where, { role });
    }
    const column = sortKey && SORTABLE_COLUMNS.includes(sortKey) ? sortKey : 'id';
    const direction = sortDirection === 'desc' ? 'DESC' : 'ASC';
    const { rows, count } = await UserModel.findAndCountAll({ where, limit, offset, order: [[column, direction]] });
    return { rows: rows.map(toPublicUser), count };
  }

  // Customers edit one field at a time; only the provided fields are validated and saved.
  async updateProfile(userId: number, body: Record<string, unknown>): Promise<AuthUser> {
    const user = await UserModel.findByPk(userId);
    if (!user) throw HttpError.notFound('Không tìm thấy tài khoản.');

    const changes: Partial<Pick<UserModel, 'firstName' | 'lastName' | 'phone' | 'address'>> = {};
    const errors: string[] = [];
    if (body.firstName !== undefined) {
      if (!isNonEmpty(body.firstName)) errors.push('Tên không được để trống.');
      else changes.firstName = asTrimmedString(body.firstName);
    }
    if (body.lastName !== undefined) {
      if (!isNonEmpty(body.lastName)) errors.push('Họ không được để trống.');
      else changes.lastName = asTrimmedString(body.lastName);
    }
    if (body.phone !== undefined) {
      if (!isValidPhone(asTrimmedString(body.phone))) errors.push('Số điện thoại không hợp lệ.');
      else changes.phone = asTrimmedString(body.phone);
    }
    if (body.address !== undefined) {
      if (!isNonEmpty(body.address, MIN_ADDRESS_LENGTH)) errors.push('Địa chỉ phải có ít nhất 4 ký tự.');
      else changes.address = asTrimmedString(body.address);
    }
    if (errors.length > 0) throw HttpError.badRequest('Thông tin cập nhật chưa hợp lệ.', errors);
    if (Object.keys(changes).length === 0) throw HttpError.badRequest('Không có thông tin nào để cập nhật.');

    await user.update(changes);
    return toPublicUser(user);
  }

  async updateRole(actorId: number, targetId: number, role: unknown): Promise<AuthUser> {
    if (!ROLES.includes(role as UserRole)) throw HttpError.badRequest('Quyền không hợp lệ.');
    if (actorId === targetId) throw HttpError.badRequest('Bạn không thể thay đổi quyền của chính mình.');
    const user = await UserModel.findByPk(targetId);
    if (!user) throw HttpError.notFound('Không tìm thấy tài khoản.');
    await user.update({ role });
    return toPublicUser(user);
  }

  async updateStatus(actorId: number, targetId: number, isActive: unknown): Promise<AuthUser> {
    if (typeof isActive !== 'boolean') throw HttpError.badRequest('Trạng thái không hợp lệ.');
    if (actorId === targetId) throw HttpError.badRequest('Bạn không thể khoá tài khoản của chính mình.');
    const user = await UserModel.findByPk(targetId);
    if (!user) throw HttpError.notFound('Không tìm thấy tài khoản.');
    await user.update({ isActive });
    return toPublicUser(user);
  }
}
