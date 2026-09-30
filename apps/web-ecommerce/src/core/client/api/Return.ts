'use client';

import Api from './Api';
import { ADMIN_RETURN_API, RETURN_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type {
  OrderReturnInfo,
  ReturnIntakeInput,
  ReturnRequest,
  ReturnRequestInput,
  ReturnStatus,
} from '@/shared/types/return';

export interface ReturnListParams {
  status?: ReturnStatus | '';
  page?: number;
  per_page?: number;
}

export default class ReturnApi {
  static async getForOrder(orderId: number): Promise<OrderReturnInfo | undefined> {
    try {
      const response = await Api.get(RETURN_API.GET_FOR_ORDER(orderId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async createReturn(input: ReturnRequestInput): Promise<ReturnRequest | undefined> {
    try {
      const response = await Api.post(RETURN_API.CREATE, input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async getReturns(params: ReturnListParams): Promise<PaginatedResult<ReturnRequest> | undefined> {
    try {
      const response = await Api.get(ADMIN_RETURN_API.GET_RETURNS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async getReturn(returnId: number): Promise<ReturnRequest | undefined> {
    try {
      const response = await Api.get(ADMIN_RETURN_API.GET_RETURN(returnId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async intake(returnId: number, input: ReturnIntakeInput): Promise<ReturnRequest | undefined> {
    try {
      const response = await Api.put(ADMIN_RETURN_API.INTAKE(returnId), input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async restock(returnId: number, itemId: number): Promise<ReturnRequest | undefined> {
    try {
      const response = await Api.put(ADMIN_RETURN_API.RESTOCK(returnId, itemId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
