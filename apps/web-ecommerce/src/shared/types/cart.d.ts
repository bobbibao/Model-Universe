import type { ProductPricing } from './product';

// Cart stored in the browser (localStorage); prices are always taken from the server quote.
export type CartItem = {
  productId: number;
  size: string;
  quantity: number;
  // Display snapshot, used until the first quote arrives.
  name: string;
  imageUrl: string;
  price: number;
  brandName: string;
};

export type CartLineStatus = 'OK' | 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'INVALID_SIZE';

export type CartLine = {
  productId: number;
  size: string;
  quantity: number;
  status: CartLineStatus;
  message?: string;
  availableStock: number;
  lineTotal: number;
  product: ({ id: number; name: string; brandName: string; imageUrl: string; price: number; partnerId?: number | null } & ProductPricing) | null;
};

export type CartQuote = {
  lines: CartLine[];
  subtotal: number;
  benefitSubtotalVnd?: number;
  itemCount: number;
  hasIssues: boolean;
  discount?: number;
  total?: number;
  couponCode?: string | null;
  // Checkout benefits under the rules v6.2 (src/shared/promotions.ts) and why a chosen code does not apply.
  voucherDiscountVnd?: number;
  voucherRefusal?: string | null;
  voucherStatus?: 'VOUCHER_INVALID' | 'VOUCHER_ONLY_VALID' | 'STACK_VALID' | null;
  // The member's rank benefit, added to the chosen code only when both profit checks pass.
  rank?: { code: string; tier: string; bps: number; capVnd: number } | null;
  rankDiscountVnd?: number;
  rankRefusal?: string | null;
  freeshipCode?: string | null;
  shippingDiscountVnd?: number;
  freeshipRefusal?: string | null;
  // Points the order earns once completed; points are not spent at checkout (pointsUsed stays 0).
  earnedPoints?: number;
  pointsUsed?: number;
  pointsDiscountVnd?: number;
  pointsMax?: number;
};

export type WishlistItem = {
  id: number;
  productId: number;
  size: string;
  createdAt: string;
  available: boolean;
  product: {
    id: number;
    name: string;
    brandName: string;
    price: number;
    imageUrl: string;
    stock: number;
  } & ProductPricing;
};
