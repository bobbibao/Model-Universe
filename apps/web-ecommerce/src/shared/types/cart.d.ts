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
  product: ({ id: number; name: string; brandName: string; imageUrl: string; price: number } & ProductPricing) | null;
};

export type CartQuote = {
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
  hasIssues: boolean;
  discount?: number;
  total?: number;
  couponCode?: string | null;
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
