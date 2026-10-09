import { CUSTOMER_ACTIONS, type CustomerAction } from './types/customer-assistant';
import { RETURN_REASONS } from './return-rules';

const ROUTES = new Set([
  '/',
  '/shop',
  '/search',
  '/cart',
  '/wishlist',
  '/order-history',
  '/user-profile',
  '/contact',
  '/about',
  '/assistant',
  '/auth/signin',
  '/auth/signup',
  '/compare',
  '/reservations',
  '/services/reserve',
  '/services/loyalty',
]);
export function customerPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 600 || !raw.startsWith('/') || raw.startsWith('//') || /[\\\s]/.test(raw))
    return;
  const url = new URL(raw, 'https://store.invalid');
  if (
    url.origin !== 'https://store.invalid' ||
    (!ROUTES.has(url.pathname) && !/^\/shop\/product\/[1-9]\d*$/.test(url.pathname))
  )
    return;
  // Queries are data, never redirects selected by the model. Authentication return paths are set by the client.
  const allowed =
    url.pathname === '/shop' || url.pathname === '/search'
      ? new Set([
          'q',
          'category',
          'grade',
          'scale',
          'series',
          'condition',
          'gender',
          'brand',
          'minPrice',
          'maxPrice',
          'sort',
          'inStock',
          'channel',
          'page',
        ])
      : new Set<string>();
  if (Array.from(url.searchParams.keys()).some((key) => !allowed.has(key))) return;
  if (url.hash && !(url.pathname === '/cart' && url.hash === '#checkout')) return;
  return `${url.pathname}${url.search}${url.hash}`;
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export function parseCustomerAction(raw: unknown): CustomerAction | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const r = raw as Record<string, unknown>;
  if (!CUSTOMER_ACTIONS.includes(r.kind as CustomerAction['kind'])) return;
  const action: CustomerAction = { kind: r.kind as CustomerAction['kind'] };
  for (const key of ['productId', 'orderId', 'wishlistItemId', 'quantity'] as const) {
    if (r[key] !== undefined && r[key] !== null) {
      if (!positive(r[key]) || (key === 'quantity' && (r[key] as number) > 999)) return;
      action[key] = r[key] as number;
    }
  }
  const limits = {
    size: 30,
    code: 80,
    name: 120,
    email: 254,
    phone: 30,
    company: 120,
    message: 2000,
    title: 120,
    content: 2000,
    firstName: 80,
    lastName: 80,
    address: 500,
    note: 500,
  };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (r[key] !== undefined && r[key] !== null) {
      if (typeof r[key] !== 'string' || (r[key] as string).length > limits[key]) return;
      action[key] = (r[key] as string).trim();
    }
  }
  if (r.rating !== undefined && r.rating !== null) {
    if (!positive(r.rating) || r.rating > 5) return;
    action.rating = r.rating;
  }
  if (action.kind === 'navigate') {
    action.path = customerPath(r.path);
    if (!action.path) return;
  }
  if (['cart_add', 'cart_update', 'cart_remove', 'wishlist_add', 'review'].includes(action.kind) && !action.productId)
    return;
  if (['cart_add', 'cart_update'].includes(action.kind) && !action.quantity) return;
  if (action.kind === 'cart_remove' && action.size === undefined) return;
  if (action.kind === 'wishlist_remove' && !action.wishlistItemId) return;
  if (['cancel_order', 'return_request'].includes(action.kind) && !action.orderId) return;
  if (action.kind === 'apply_coupon' && !action.code) return;
  if (action.kind === 'checkout' && r.shipping !== undefined && r.shipping !== null) {
    if (typeof r.shipping !== 'object' || Array.isArray(r.shipping)) return;
    const shipping: NonNullable<CustomerAction['shipping']> = {};
    for (const key of ['recipientName', 'phone', 'address', 'ward', 'district', 'city', 'note'] as const) {
      const value = (r.shipping as Record<string, unknown>)[key];
      if (value !== undefined) {
        if (typeof value !== 'string' || value.length > 500) return;
        shipping[key] = value.trim();
      }
    }
    action.shipping = shipping;
  }
  if (action.kind === 'return_request') {
    if (!Array.isArray(r.returnItems) || !r.returnItems.length || r.returnItems.length > 30) return;
    const items: NonNullable<CustomerAction['returnItems']> = [];
    for (const item of r.returnItems) {
      if (
        !item ||
        !positive(item.orderItemId) ||
        !positive(item.quantity) ||
        item.quantity > 999 ||
        !RETURN_REASONS.includes(item.reason)
      )
        return;
      items.push({ orderItemId: item.orderItemId, quantity: item.quantity, reason: item.reason });
    }
    action.returnItems = items;
  }
  return action;
}
