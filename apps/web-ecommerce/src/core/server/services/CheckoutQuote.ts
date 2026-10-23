import crypto from 'crypto';
import { VOUCHER_RULE_VERSION } from '../../../shared/voucher-stack';
import type { CartLine } from './CartService';
import type { ResolvedBenefits } from './PromotionService';

// Signed checkout quotes (v6.2 SRS: "a signed quote with an id and TTL"). The cart quote returns an id that binds the
// goods, their prices and the benefits it showed; placing the order recomputes everything and refuses the order when
// the quote is forged, expired or no longer matches (TC29), so the customer confirms again. Stateless: an HMAC with a
// key derived from JWT_SECRET, nothing stored.
export const QUOTE_TTL_MS = 30 * 60_000;

export interface QuoteContent {
  userId: number | null;
  items: { productId: number; size: string; quantity: number; unitVnd: number }[];
  couponCode: string | null;
  freeshipCode: string | null;
  voucherDiscountVnd: number;
  rankDiscountVnd: number;
  ruleVersion: string;
  policyVersion: number | null;
}

export type QuoteCheck = 'OK' | 'INVALID' | 'EXPIRED' | 'CHANGED';

const key = () => `checkout-quote:v1:${process.env.JWT_SECRET || ''}`;
const mac = (body: string) => crypto.createHmac('sha256', key()).update(body).digest('base64url');
const digest = (content: QuoteContent) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        ...content,
        items: [...content.items].sort((a, b) => a.productId - b.productId || a.size.localeCompare(b.size)),
      }),
    )
    .digest('base64url');

export const signQuote = (content: QuoteContent, now = Date.now()) => {
  const expiresAt = now + QUOTE_TTL_MS;
  const body = `${expiresAt}.${digest(content)}`;
  return { id: `${body}.${mac(body)}`, expiresAt: new Date(expiresAt).toISOString() };
};

export const checkQuote = (id: unknown, content: QuoteContent, now = Date.now()): QuoteCheck => {
  if (typeof id !== 'string' || id.length > 200) return 'INVALID';
  const [expires, hash, signature, extra] = id.split('.');
  if (!expires || !hash || !signature || extra !== undefined) return 'INVALID';
  const expected = Buffer.from(mac(`${expires}.${hash}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return 'INVALID';
  if (!/^\d+$/.test(expires) || Number(expires) <= now) return 'EXPIRED';
  return hash === digest(content) ? 'OK' : 'CHANGED';
};

// What a quote binds, built the same way by the cart quote and by the order: the lines charged and the benefits
// accepted (shipping is quoted separately and covered by the confirmed total).
export const quoteContent = (userId: number | null | undefined, lines: CartLine[], resolved: ResolvedBenefits): QuoteContent => ({
  userId: userId ?? null,
  items: lines
    .filter((line) => line.status === 'OK' && line.product)
    .map((line) => ({ productId: line.productId, size: line.size, quantity: line.quantity, unitVnd: line.product!.salePrice })),
  couponCode: resolved.voucher && !resolved.benefits.voucherRefusal ? resolved.voucher.code : null,
  freeshipCode: resolved.freeship && !resolved.benefits.freeshipRefusal ? resolved.freeship.code : null,
  voucherDiscountVnd: resolved.benefits.voucherDiscountVnd,
  rankDiscountVnd: resolved.benefits.rankDiscountVnd,
  ruleVersion: VOUCHER_RULE_VERSION,
  policyVersion: resolved.policyVersion,
});
