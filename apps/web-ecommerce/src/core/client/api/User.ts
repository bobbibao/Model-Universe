'use client';

import Api from './Api';
import { ADMIN_USER_API, USER_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { User, UserRole } from '@/shared/types/user';

export interface UserListParams {
  q?: string;
  role?: UserRole | '';
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export default class UserApi {
  static async updateProfile(changes: Partial<Pick<User, 'firstName' | 'lastName' | 'phone' | 'address'>>) {
    try {
      const response = await Api.put(USER_API.UPDATE_ME, changes);
      return response.data as User;
    } catch (error) {
      return undefined;
    }
  }

  static async getUsers(params: UserListParams): Promise<PaginatedResult<User> | undefined> {
    try {
      const response = await Api.get(ADMIN_USER_API.GET_USERS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async updateRole(userId: number, role: UserRole): Promise<User | undefined> {
    try {
      const response = await Api.put(ADMIN_USER_API.UPDATE_ROLE(userId), { role });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async updateStatus(userId: number, isActive: boolean): Promise<User | undefined> {
    try {
      const response = await Api.put(ADMIN_USER_API.UPDATE_STATUS(userId), { isActive });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
