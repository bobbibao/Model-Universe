'use client';

import Api from './Api';
import type { PlaceOrderInput } from './Order';
import type { PaymentPlan } from '@/shared/payment';

export type CheckoutSessionStatus = 'OPEN' | 'PAID' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'FAILED';

// An online checkout waiting for its QR payment (the order is created once payOS confirms it).
export interface CheckoutSession {
  id: number;
  status: CheckoutSessionStatus;
  orderId: number | null;
  totalVnd: number;
  upfrontDueVnd: number;
  // The deposit plan's amount (10% of the merchandise, at least the shipping fee).
  depositAmountVnd: number;
  balanceVnd: number;
  paymentPlan: PaymentPlan;
  depositVnd: number | null;
  expiresAt: string;
  serverTime: string;
  shipping: { feeVnd: number; carrierName: string | null; source: string } | null;
  // The latest QR received less than asked (staff refund it); a new QR is needed.
  underpaid?: { amountVnd: number; reference: string | null } | null;
  payment: {
    amountVnd: number;
    qrCode: string | null;
    checkoutUrl: string | null;
    bankBin: string | null;
    accountNumber: string | null;
    accountName: string | null;
    description: string | null;
  } | null;
}

let pending: { digest: string; key: string } | undefined;

// The same checkout request reuses its key, so a retried click returns the same QR instead of a second payment.
const requestKey = async (input: unknown) => {
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))),
  )
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (pending?.digest !== digest) pending = { digest, key: crypto.randomUUID() };
  return pending.key;
};

export default class CheckoutApi {
  static async start(input: PlaceOrderInput, locale: string): Promise<CheckoutSession> {
    const key = await requestKey(input);
    return (await Api.post('/checkout/sessions', { ...input, requestKey: key, locale })).data;
  }
  // A finished or abandoned checkout starts with a new key next time.
  static forget() {
    pending = undefined;
  }
  static async status(id: number): Promise<CheckoutSession> {
    return (await Api.get(`/checkout/sessions/${id}`)).data;
  }
  static async changePlan(
    id: number,
    paymentPlan: PaymentPlan,
    depositVnd: number | undefined,
    locale: string,
  ): Promise<CheckoutSession> {
    return (await Api.post(`/checkout/sessions/${id}/plan`, { paymentPlan, depositVnd, locale })).data;
  }
  // The customer's checkouts still waiting for payment (the orders page shows them again; nothing new is created).
  static async open(): Promise<CheckoutSession[]> {
    return (await Api.get('/checkout/sessions')).data;
  }
  static async cancel(id: number): Promise<CheckoutSession> {
    return (await Api.post(`/checkout/sessions/${id}/cancel`)).data;
  }
}
