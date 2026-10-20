'use client';

import Api from './Api';
import { CART_API } from './endpoint';
import type { CartQuote } from '@/shared/types/cart';

export interface QuoteBenefits {
  couponCode?: string;
  freeshipCode?: string;
  redeemPoints?: number;
  shippingFeeVnd?: number;
}

export default class CartApi {
  // The cart priced with its benefits; a refused code comes back with its reason.
  static async getQuote(
    items: { productId: number; size: string; quantity: number }[],
    benefits: QuoteBenefits = {},
  ): Promise<CartQuote | undefined> {
    try {
      const response = await Api.post(CART_API.QUOTE, { items, ...benefits });
      return response.data;
    } catch {
      return undefined;
    }
  }
}
