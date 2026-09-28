'use client';

import Api from './Api';
import { CART_API } from './endpoint';
import type { CartQuote } from '@/shared/types/cart';

export default class CartApi {
  static async getQuote(
    items: { productId: number; size: string; quantity: number }[],
  ): Promise<CartQuote | undefined> {
    try {
      const response = await Api.post(CART_API.QUOTE, { items });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
