'use client';

import Api from './Api';
import { ADMIN_COUPON_API, COUPON_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { Coupon, CouponInput, CouponPreview } from '@/shared/types/order';

export interface CouponListParams {
  q?: string;
  status?: '' | 'active' | 'expired' | 'inactive';
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export default class CouponApi {
  static async validateCoupon(code: string): Promise<CouponPreview | undefined> {
    try {
      const response = await Api.get(COUPON_API.VALIDATE(code));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async getCoupons(params: CouponListParams): Promise<PaginatedResult<Coupon> | undefined> {
    try {
      const response = await Api.get(ADMIN_COUPON_API.GET_COUPONS, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async createCoupon(input: CouponInput): Promise<Coupon | undefined> {
    try {
      const response = await Api.post(ADMIN_COUPON_API.CREATE_COUPON, input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async updateCoupon(couponId: number, input: CouponInput): Promise<Coupon | undefined> {
    try {
      const response = await Api.put(ADMIN_COUPON_API.UPDATE_COUPON(couponId), input);
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async deleteCoupon(couponId: number): Promise<boolean> {
    try {
      await Api.delete(ADMIN_COUPON_API.DELETE_COUPON(couponId));
      return true;
    } catch (error) {
      return false;
    }
  }
}
