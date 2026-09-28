'use client';

import Api from './Api';
import { ADMIN_CATEGORY_API, CATEGORY_API } from './endpoint';
import type { Category } from '@/shared/types/product';

export type CategoryInput = { name: string; slug?: string };

export default class CategoryApi {
  static async getCategories(): Promise<Category[]> {
    try {
      const response = await Api.get(CATEGORY_API.GET_CATEGORIES);
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  static async getAdminCategories(): Promise<Category[] | undefined> {
    try {
      const response = await Api.get(ADMIN_CATEGORY_API.GET_CATEGORIES);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async createCategory(input: CategoryInput): Promise<Category | undefined> {
    try {
      const response = await Api.post(ADMIN_CATEGORY_API.CREATE_CATEGORY, input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async updateCategory(categoryId: number, input: CategoryInput): Promise<Category | undefined> {
    try {
      const response = await Api.put(ADMIN_CATEGORY_API.UPDATE_CATEGORY(categoryId), input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async deleteCategory(categoryId: number): Promise<boolean> {
    try {
      await Api.delete(ADMIN_CATEGORY_API.DELETE_CATEGORY(categoryId));
      return true;
    } catch (error) {
      return false;
    }
  }
}
