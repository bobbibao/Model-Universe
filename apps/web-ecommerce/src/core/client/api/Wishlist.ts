'use client';

import Api from './Api';
import { WISHLIST_API } from './endpoint';
import type { WishlistItem } from '@/shared/types/cart';

export default class WishlistApi {
  static async getWishlist(): Promise<WishlistItem[] | undefined> {
    try {
      const response = await Api.get(WISHLIST_API.GET_WISHLIST);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async addItem(
    productId: number,
    size: string,
  ): Promise<Pick<WishlistItem, 'id' | 'productId' | 'size'> | undefined> {
    try {
      const response = await Api.post(WISHLIST_API.ADD_ITEM, { productId, size });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async removeItem(itemId: number): Promise<boolean> {
    try {
      await Api.delete(WISHLIST_API.REMOVE_ITEM(itemId));
      return true;
    } catch (error) {
      return false;
    }
  }
}
