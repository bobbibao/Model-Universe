import OrderService from '../../../src/core/server/services/OrderService';

// Checkout payment plan for fixture orders: the minimum deposit (10%), the balance collected as COD on delivery.
export const DEPOSIT = { paymentPlan: 'deposit' } as const;

// Records the order's verified upfront transfer, as staff do before shipping (OrderService.recordPrepayment).
export const prepay = (order: { id: number; upfrontDueVnd: number }, adminId: number) =>
  new OrderService().recordPrepayment(order.id, adminId, {
    kind: 'receipt',
    amountVnd: order.upfrontDueVnd,
    externalReference: `FIXTURE-DEPOSIT-${order.id}-${Date.now()}`,
    reason: 'Fixture verified deposit transfer',
    moneyVerified: true,
  });
