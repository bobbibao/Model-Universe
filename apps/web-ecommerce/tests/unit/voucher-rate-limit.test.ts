import type { NextFunction, Request, Response } from 'express';
import {
  MAX_DISTINCT_CODES,
  MAX_REDEMPTIONS,
  VoucherRateLimitMiddleware,
} from '../../src/core/server/middleware/VoucherRateLimit.Middleware';

const call = (path: string, body: Record<string, unknown>, userId: number) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
  const next = jest.fn() as NextFunction;
  VoucherRateLimitMiddleware(
    { method: 'POST', path, body, user: { id: userId }, ip: '203.0.113.9', socket: {} } as unknown as Request,
    res as unknown as Response,
    next,
  );
  return { limited: res.status.mock.calls[0]?.[0] === 429, passed: (next as jest.Mock).mock.calls.length === 1 };
};

describe('voucher rate limit (code enumeration)', () => {
  it('counts distinct codes per customer, never repeated quotes of the same code or plain quotes', () => {
    for (let i = 0; i < 100; i++) expect(call('/cart/quote', { couponCode: 'MEMBER10' }, 1).passed).toBe(true);
    for (let i = 0; i < 100; i++) expect(call('/cart/quote', { items: [] }, 1).passed).toBe(true);
    for (let i = 1; i < MAX_DISTINCT_CODES; i++) expect(call('/cart/quote', { couponCode: `TRY${i}` }, 1).passed).toBe(true);
    expect(call('/cart/quote', { couponCode: 'one-more' }, 1).limited).toBe(true);
    expect(call('/cart/quote', { couponCode: 'member10' }, 1).passed).toBe(true); // already tried, any case
    expect(call('/cart/quote', { couponCode: 'TRY-OTHER' }, 2).passed).toBe(true); // another customer
    expect(call('/cart/other', { couponCode: 'X' }, 1).passed).toBe(true); // other routes untouched
  });

  it('limits point redemptions per customer', () => {
    for (let i = 0; i < MAX_REDEMPTIONS; i++) expect(call('/loyalty/redeem', {}, 3).passed).toBe(true);
    expect(call('/loyalty/redeem', {}, 3).limited).toBe(true);
  });
});
