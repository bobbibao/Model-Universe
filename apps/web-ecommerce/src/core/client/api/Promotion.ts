'use client';

import Api from './Api';

import type { ProductSummary } from '@/shared/types/product';

export interface VoucherDrop {
  id: number;
  // drop: saved to the wallet first, limited saves; standing: a public code typed at checkout.
  kind?: 'drop' | 'standing';
  code: string | null;
  title: string;
  benefitType: 'discount' | 'freeship';
  discountPercent: number;
  fixedAmountVnd: number | null;
  maxDiscountVnd: number | null;
  maxShippingVnd: number | null;
  minOrderVnd: number;
  minTier: string | null;
  startsAt: string;
  expiresAt: string;
  remaining: number | null;
  claimLimit: number | null;
  claimed: boolean;
}

export interface PromotionsHub {
  loyaltyOpen: boolean;
  standing: VoucherDrop[];
  drops: VoucherDrop[];
  member: {
    tier: string;
    nextTier: { name: string; points: number } | null;
    lifetime: number;
    points: number;
    // The rank benefit the tier adds on top of one main voucher, when both profit checks pass (rules v6.2).
    rank: { tier: string; code: string; bps: number; capVnd: number } | null;
    pending: { orders: number; points: number };
  } | null;
  checkin: { doneToday: boolean; streak: number; nextReward: { day: number; points: number; freeship: boolean } };
  wheel: { prizes: string[]; spunToday: boolean };
  missions: { key: string; points: number; claimed: boolean; ready: boolean }[];
  events: {
    id: number;
    title: string;
    description: string | null;
    endsAt: string;
    maximumPercent: number;
    products: ProductSummary[];
  }[];
}

export interface WheelResult {
  index: number;
  label: string;
  couponCode: string | null;
}

// The promotions hub and its actions (src/app/api/Promotion.Controller.ts).
export default class PromotionApi {
  static async hub(): Promise<PromotionsHub | null> {
    try {
      return (await Api.get('/promotions/hub')).data as PromotionsHub;
    } catch {
      return null;
    }
  }
  static async checkin() {
    return (await Api.post('/promotions/checkin', {})).data as {
      day: number;
      points: number;
      couponCode: string | null;
    };
  }
  static async spin() {
    return (await Api.post('/promotions/wheel', {})).data as WheelResult;
  }
  static async mission(key: string) {
    return (await Api.post(`/promotions/missions/${key}`, {})).data as { points: number };
  }
  static async claim(id: number) {
    return (await Api.post(`/promotions/vouchers/${id}/claim`, {})).data as { code: string };
  }
}
