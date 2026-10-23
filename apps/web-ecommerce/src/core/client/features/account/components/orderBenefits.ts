import type { Order } from '@/shared/types/order';

// The benefits of a placed order as the customer may see them (the public part of `benefitSnapshot`, rules v6.2): the
// voucher, the rank benefit and the free shipping each on their own line, and the points the order earns once
// completed. Orders placed before v6.2 carry only `discount`.
export interface OrderBenefits {
  voucher: { code: string | null; amountVnd: number } | null;
  rank: { tier: string; amountVnd: number } | null;
  freeship: { code: string | null; amountVnd: number } | null;
  earnedPoints: number | null;
}

const record = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : null);
const amount = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);

export const orderBenefits = (order: Order): OrderBenefits => {
  const snapshot = record(order.benefitSnapshot);
  const voucher = record(snapshot?.voucher),
    rank = record(snapshot?.rank),
    freeship = record(snapshot?.freeship);
  const rankVnd = amount(rank?.discountVnd);
  const voucherVnd = voucher ? amount(voucher.discountVnd) : Math.max(0, order.discount - rankVnd);
  const shippingVnd = amount(order.shippingDiscountVnd ?? freeship?.shippingDiscountVnd);
  return {
    voucher:
      voucherVnd > 0
        ? { code: (voucher?.couponCode as string) ?? order.couponCode ?? null, amountVnd: voucherVnd }
        : null,
    rank: rankVnd > 0 && typeof rank?.tier === 'string' ? { tier: rank.tier, amountVnd: rankVnd } : null,
    freeship:
      shippingVnd > 0
        ? { code: (freeship?.couponCode as string) ?? order.freeshipCode ?? null, amountVnd: shippingVnd }
        : null,
    earnedPoints: typeof snapshot?.earnedPoints === 'number' ? snapshot.earnedPoints : null,
  };
};
