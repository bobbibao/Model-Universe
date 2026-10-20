import { cancellationFeeVnd, isCustomerSideCancellation } from '../../src/shared/cancellation';
import { depositDueVnd } from '../../src/shared/payment';

describe('cancellation fee (50% of the deposit when the customer gives a paid order up)', () => {
  const order = { total: 2_030_000, subtotal: 2_000_000, discount: 0, shippingFee: 30_000 };

  it('keeps half of the deposit actually paid', () => {
    expect(cancellationFeeVnd({ ...order, paymentPlan: 'deposit', upfrontDueVnd: 200_000, prepaidVnd: 200_000 })).toBe(
      100_000,
    );
    expect(cancellationFeeVnd({ ...order, paymentPlan: 'deposit', upfrontDueVnd: 200_000, prepaidVnd: 0 })).toBe(0);
    expect(cancellationFeeVnd({ ...order, paymentPlan: 'deposit', upfrontDueVnd: 200_001, prepaidVnd: 200_001 })).toBe(
      100_000,
    );
  });

  it('uses the deposit the order would have needed when it was paid in full', () => {
    const deposit = depositDueVnd(order.total, order.subtotal - order.discount, order.shippingFee);
    expect(
      cancellationFeeVnd({ ...order, paymentPlan: 'full', upfrontDueVnd: order.total, prepaidVnd: order.total }),
    ).toBe(Math.floor(deposit / 2));
  });

  it('applies only when the customer gave the order up', () => {
    expect(isCustomerSideCancellation({ cancelledBy: 'customer' })).toBe(true);
    expect(isCustomerSideCancellation({ cancelledBy: 'staff', cancelReason: 'customer_request' })).toBe(true);
    expect(isCustomerSideCancellation({ cancelledBy: 'staff', cancelReason: 'customer_unreachable' })).toBe(true);
    expect(isCustomerSideCancellation({ cancelledBy: 'system', cancelReason: 'customer_request' })).toBe(true);
    expect(isCustomerSideCancellation({ cancelledBy: 'staff', cancelReason: 'out_of_stock' })).toBe(false);
    expect(isCustomerSideCancellation({ cancelledBy: 'system', cancelReason: 'payment_timeout' })).toBe(false);
  });
});
