import type { ProductDetail, ProductSummary } from './product';
import type { ShippingInfo } from './order';
import type { ReturnReason } from './return';

export const CUSTOMER_ACTIONS = [
  'navigate',
  'cart_add',
  'cart_update',
  'cart_remove',
  'cart_clear',
  'wishlist_add',
  'wishlist_remove',
  'apply_coupon',
  'contact',
  'review',
  'cancel_order',
  'return_request',
  'update_profile',
  'checkout',
  'logout',
] as const;
export type CustomerActionKind = (typeof CUSTOMER_ACTIONS)[number];
// These are proposals, never proof that an action has happened. Only the customer's browser executes them.
export type CustomerAction = {
  kind: CustomerActionKind;
  productId?: number;
  product?: ProductDetail;
  size?: string;
  quantity?: number;
  path?: string;
  code?: string;
  orderId?: number;
  orderTotal?: number;
  returnLines?: { orderItemId: number; name: string; size: string; maxQuantity: number }[];
  wishlistItemId?: number;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  rating?: number;
  title?: string;
  content?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  shipping?: Partial<ShippingInfo>;
  returnItems?: { orderItemId: number; quantity: number; reason: ReturnReason }[];
  note?: string;
};
export type AssistantSource = { label: string; path: string };
export type AssistantReply = {
  answer: string;
  products: ProductSummary[];
  sources: AssistantSource[];
  actions: CustomerAction[];
  research: boolean;
};
export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: AssistantReply;
};
export type AssistantRequest = {
  message: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  research: boolean;
  path: string;
  cart: { productId: number; size: string; quantity: number }[];
};
