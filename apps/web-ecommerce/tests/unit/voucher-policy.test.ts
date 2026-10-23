import {
  DEFAULT_PROFIT_POLICY,
  DEFAULT_VOUCHER_POLICY,
  evaluateStack,
  parseVoucherPolicy,
  type StackLine,
} from '../../src/shared/voucher-stack';
import { checkQuote, signQuote, QUOTE_TTL_MS, type QuoteContent } from '../../src/core/server/services/CheckoutQuote';

const v62 = { ...DEFAULT_VOUCHER_POLICY } as Record<string, unknown>;

describe('voucher policy (commerce policy "voucher")', () => {
  it('accepts the v6.2 values and stricter ones', () => {
    expect(parseVoucherPolicy(v62)).toEqual(DEFAULT_VOUCHER_POLICY);
    expect(
      parseVoucherPolicy({ ...v62, keepPlainBps: 9000, keepStackBps: 8500, minimumProfitVnd: 80_000, feeBps: 150, pricingApproval: 'required' }),
    ).toMatchObject({ keepPlainBps: 9000, keepStackBps: 8500, minimumProfitVnd: 80_000, feeBps: 150, pricingApproval: 'required' });
  });

  it.each([
    ['keepPlainBps', 7999],
    ['keepStackBps', 7499],
    ['minimumProfitVnd', 49_999],
    ['minimumMarginBps', 499],
    ['feeBps', -1],
    ['pointReserveVnd', 1_119],
    ['keepPlainBps', 80.5],
    ['pricingApproval', 'none'],
  ])('never loosens a guard: %s = %p is refused', (key, value) => {
    expect(() => parseVoucherPolicy({ ...v62, [key]: value })).toThrow();
  });

  it('keeps the stacked share at most the plain share', () => {
    expect(() => parseVoucherPolicy({ ...v62, keepPlainBps: 8000, keepStackBps: 8500 })).toThrow();
  });

  it('a stricter policy refuses a voucher the v6.2 values accept (TC07 KIT12 keeps 84.55%)', () => {
    const lines: StackLine[] = [{ sku: 'A', quantity: 1, listPriceVnd: 1_666_667, unitCostVnd: 1_250_000, shopOwned: true }];
    const voucher = { code: 'KIT12', kind: 'PERCENT' as const, bps: 1200, capVnd: 500_000 };
    expect(evaluateStack({ lines, voucher, rank: null }).status).toBe('VOUCHER_ONLY_VALID');
    const strict = { ...DEFAULT_PROFIT_POLICY, keepPlainBps: 8600 };
    expect(evaluateStack({ lines, voucher, rank: null, policy: strict })).toMatchObject({
      status: 'VOUCHER_INVALID',
      reason: 'INSUFFICIENT_PROFIT_80',
    });
  });
});

describe('signed checkout quotes', () => {
  const content: QuoteContent = {
    userId: 7,
    items: [
      { productId: 2, size: '', quantity: 1, unitVnd: 500_000 },
      { productId: 1, size: 'M', quantity: 2, unitVnd: 1_000_000 },
    ],
    couponCode: 'MEMBER10',
    freeshipCode: null,
    voucherDiscountVnd: 250_000,
    rankDiscountVnd: 12_500,
    ruleVersion: 'v6.2',
    policyVersion: null,
  };
  const now = Date.UTC(2026, 9, 23, 3);

  it('accepts the same content in any line order until it expires', () => {
    const { id, expiresAt } = signQuote(content, now);
    expect(Date.parse(expiresAt) - now).toBe(QUOTE_TTL_MS);
    expect(checkQuote(id, { ...content, items: [...content.items].reverse() }, now + 60_000)).toBe('OK');
    expect(checkQuote(id, content, now + QUOTE_TTL_MS)).toBe('EXPIRED');
  });

  it('reports a changed price, benefit, owner or policy as CHANGED', () => {
    const { id } = signQuote(content, now);
    expect(checkQuote(id, { ...content, rankDiscountVnd: 0 }, now)).toBe('CHANGED');
    expect(checkQuote(id, { ...content, userId: 8 }, now)).toBe('CHANGED');
    expect(checkQuote(id, { ...content, policyVersion: 2 }, now)).toBe('CHANGED');
    expect(
      checkQuote(id, { ...content, items: [{ ...content.items[0], unitVnd: 499_000 }, content.items[1]] }, now),
    ).toBe('CHANGED');
  });

  it('refuses a forged or malformed id', () => {
    const { id } = signQuote(content, now);
    const [expires, hash, signature] = id.split('.');
    expect(checkQuote(`${Number(expires) + 3_600_000}.${hash}.${signature}`, content, now)).toBe('INVALID');
    expect(checkQuote(`${expires}.${hash}.${signature.slice(1)}x`, content, now)).toBe('INVALID');
    expect(checkQuote('nonsense', content, now)).toBe('INVALID');
    expect(checkQuote(undefined, content, now)).toBe('INVALID');
  });
});
