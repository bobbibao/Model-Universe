import type { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../../shared/server/utils/ApiResponseUtils';

// Against code enumeration and probing the profit guard by timing (v6.2 SRS: rate-limit preview and redemption). Per
// process, like the sign-in limiters. A cart quote is limited by how many *different* codes one customer (or address)
// tries in the window, so re-quoting the same code as the cart changes never counts; redemptions are limited per call.
const WINDOW_MS = 15 * 60_000;
export const MAX_DISTINCT_CODES = 20;
export const MAX_REDEMPTIONS = 30;
const tries = new Map<string, { codes: Set<string>; calls: number; until: number }>();

const codesOf = (body: Record<string, unknown>) =>
  ['couponCode', 'freeshipCode']
    .map((field) => (typeof body[field] === 'string' ? (body[field] as string).trim().toUpperCase() : ''))
    .filter(Boolean);

// Mounted under /api after authentication, so a signed-in customer is counted by account.
const LIMITED = new Set(['/cart/quote', '/loyalty/redeem']);

export function VoucherRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' || !LIMITED.has(req.path)) return next();
  const now = Date.now();
  for (const [key, value] of tries) if (value.until <= now) tries.delete(key);
  const redemption = req.path.endsWith('/redeem');
  const codes = redemption ? [] : codesOf((req.body || {}) as Record<string, unknown>);
  if (!redemption && !codes.length) return next();
  const key = `${redemption ? 'redeem' : 'codes'}:${req.user?.id ?? req.ip ?? req.socket.remoteAddress}`;
  const entry = tries.get(key) ?? { codes: new Set<string>(), calls: 0, until: now + WINDOW_MS };
  const fresh = codes.filter((code) => !entry.codes.has(code));
  if (redemption ? entry.calls >= MAX_REDEMPTIONS : entry.codes.size + fresh.length > MAX_DISTINCT_CODES) {
    res.setHeader('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
    return new ApiResponse({
      statusCode: 429,
      toastType: 'error',
      userMessages: ['Bạn đã thử quá nhiều mã. Vui lòng thử lại sau ít phút.'],
    }).send(res);
  }
  entry.calls++;
  fresh.forEach((code) => entry.codes.add(code));
  tries.set(key, entry);
  next();
}
