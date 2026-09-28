'use client';

import Api from './Api';
import { ADMIN_STOCK_IMPORT_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { StockImport, StockImportInput } from '@/shared/types/inventory';

export default class StockImportApi {
  static async getStockImports(params: {
    page?: number;
    per_page?: number;
    supplierId?: number | '';
  }): Promise<PaginatedResult<StockImport> | undefined> {
    try {
      const response = await Api.get(ADMIN_STOCK_IMPORT_API.GET_STOCK_IMPORTS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async getStockImport(stockImportId: number): Promise<StockImport | undefined> {
    try {
      const response = await Api.get(ADMIN_STOCK_IMPORT_API.GET_STOCK_IMPORT(stockImportId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async createStockImport(input: StockImportInput): Promise<StockImport | undefined> {
    try {
      const response = await Api.post(ADMIN_STOCK_IMPORT_API.CREATE_STOCK_IMPORT, input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
