'use client';

import Api from './Api';
import { ADMIN_ORDER_API, ORDER_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { Order, OrderStatus, ShippingInfo } from '@/shared/types/order';

export interface PlaceOrderInput {
  items: { productId: number; size: string; quantity: number }[];
  shipping: ShippingInfo;
  couponCode?: string;
}

export interface AdminOrderListParams {
  status?: OrderStatus | '';
  q?: string;
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export default class OrderApi {
  static async placeOrder(input: PlaceOrderInput): Promise<Order | undefined> {
    try {
      const response = await Api.post(ORDER_API.PLACE_ORDER, input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async getMyOrders(page: number, perPage: number): Promise<PaginatedResult<Order> | undefined> {
    try {
      const response = await Api.get(ORDER_API.GET_MY_ORDERS, { params: { page, per_page: perPage } });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async getMyOrder(orderId: number): Promise<Order | undefined> {
    try {
      const response = await Api.get(ORDER_API.GET_MY_ORDER(orderId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async cancelMyOrder(orderId: number): Promise<Order | undefined> {
    try {
      const response = await Api.put(ORDER_API.CANCEL_MY_ORDER(orderId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async getOrders(params: AdminOrderListParams): Promise<PaginatedResult<Order> | undefined> {
    try {
      const response = await Api.get(ADMIN_ORDER_API.GET_ORDERS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async getOrder(orderId: number): Promise<Order | undefined> {
    try {
      const response = await Api.get(ADMIN_ORDER_API.GET_ORDER(orderId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async updateStatus(orderId: number, status: OrderStatus): Promise<Order | undefined> {
    try {
      const response = await Api.put(ADMIN_ORDER_API.UPDATE_STATUS(orderId), { status });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
