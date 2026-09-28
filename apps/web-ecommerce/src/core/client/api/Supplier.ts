'use client';

import Api from './Api';
import { ADMIN_SUPPLIER_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { Supplier } from '@/shared/types/product';

export type SupplierInput = Omit<Supplier, 'id' | 'createdAt'>;
export type SupplierOption = Pick<Supplier, 'id' | 'name' | 'contactPhone'>;

export interface SupplierListParams {
  q?: string;
  status?: '' | 'active' | 'inactive';
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export default class SupplierApi {
  static async getSuppliers(params: SupplierListParams): Promise<PaginatedResult<Supplier> | undefined> {
    try {
      const response = await Api.get(ADMIN_SUPPLIER_API.GET_SUPPLIERS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async getSupplierOptions(): Promise<SupplierOption[]> {
    try {
      const response = await Api.get(ADMIN_SUPPLIER_API.GET_SUPPLIER_OPTIONS);
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  static async createSupplier(input: SupplierInput): Promise<Supplier | undefined> {
    try {
      const response = await Api.post(ADMIN_SUPPLIER_API.CREATE_SUPPLIER, input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async updateSupplier(supplierId: number, input: SupplierInput): Promise<Supplier | undefined> {
    try {
      const response = await Api.put(ADMIN_SUPPLIER_API.UPDATE_SUPPLIER(supplierId), input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async deleteSupplier(supplierId: number): Promise<boolean> {
    try {
      await Api.delete(ADMIN_SUPPLIER_API.DELETE_SUPPLIER(supplierId));
      return true;
    } catch (error) {
      return false;
    }
  }
}
