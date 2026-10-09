'use client';

import Api from './Api';
import { ADMIN_ORDER_API, ORDER_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { Order, OrderStatus, ShippingInfo } from '@/shared/types/order';

export interface PlaceOrderInput {
  items: { productId: number; size: string; quantity: number }[];
  shipping: ShippingInfo;
  couponCode?: string;
  useMemberDiscount?: boolean;
  // The total the customer reviewed; the server rejects a different total inside the order transaction.
  expectedTotal?: number;
}

export interface AdminOrderListParams {
  status?: OrderStatus | '';
  q?: string;
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

let pendingCheckout: { digest: string; key: string } | undefined;

export default class OrderApi {
  static async confirmCollection(
    orderId: number,
    input: { amountVnd: number; externalReference: string; reason: string; moneyVerified: boolean },
  ): Promise<Order | undefined> {
    try {
      return (await Api.post(`/admin/orders/${orderId}/collection`, input)).data;
    } catch {
      return undefined;
    }
  }
  static async placeOrder(input: PlaceOrderInput): Promise<Order | undefined> {
    try {
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))),
      )
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const storageKey = 'model-universe.pending-checkout.v1';
      let pending = pendingCheckout;
      try {
        pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      } catch {
        /* Ignore malformed local state. */
      }
      if (pending?.digest !== digest || !/^[0-9a-f-]{36}$/.test(pending.key))
        pending = { digest, key: crypto.randomUUID() };
      pendingCheckout = pending;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(pending));
      } catch {
        /* Retry identity remains in memory when storage is disabled. */
      }
      const response = await Api.post(ORDER_API.PLACE_ORDER, { ...input, requestKey: pending.key });
      pendingCheckout = undefined;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Storage may be disabled. */
      }
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
