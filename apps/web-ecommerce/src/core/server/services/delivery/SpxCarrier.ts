import crypto from 'crypto';
import { billableWeightGram, estimateShippingFeeVnd, type PackageSpec, type ShipmentStatus } from '../../../../shared/fulfillment';

// The SPX Express carrier behind one interface. Two modes, chosen with SPX_MODE:
//   fake    (default) never calls out: deterministic quotes and SPXVN tracking numbers, and staff can simulate the
//           carrier's status events from the order page. For development and demos only.
//   manual  staff create the waybill in the SPX portal and record its tracking number and actual fee here; status
//           events are recorded by staff or arrive on the signed webhook.
// A direct SPX API integration is not implemented: its endpoints, COD limits and webhook format are not verified
// (open decision 10 of the specification), and a fake live provider is never acceptable.

export type SpxMode = 'fake' | 'manual';

export interface CarrierQuote {
  feeVnd: number;
  billableWeightGram: number;
  basis: string;
}

export interface CarrierWaybill {
  carrierOrderId: string;
  trackingNumber: string;
  trackingUrl: string;
}

const env = (name: string) => process.env[name]?.trim() ?? '';

export const spxMode = (): SpxMode => {
  const value = env('SPX_MODE') || 'fake';
  if (value !== 'fake' && value !== 'manual') throw new Error('SPX_MODE must be fake or manual');
  return value;
};

// The largest COD SPX will collect on one parcel. Not verified with SPX yet (open decision 10): configurable, with a
// conservative default.
export const spxCodLimitVnd = () => {
  const value = Number(env('SPX_COD_LIMIT_VND') || 20_000_000);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('SPX_COD_LIMIT_VND must be a positive whole VND amount');
  return value;
};

export const assertDeliveryConfig = () => {
  spxMode();
  spxCodLimitVnd();
  if (process.env.NODE_ENV === 'production' && spxMode() === 'fake' && env('SPX_ALLOW_FAKE_IN_PRODUCTION') !== 'true')
    throw new Error('SPX_MODE=fake creates simulated waybills; use SPX_MODE=manual in production (or set SPX_ALLOW_FAKE_IN_PRODUCTION=true for a demo).');
};

export const trackingUrl = (trackingNumber: string) =>
  `https://spx.vn/track?${new URLSearchParams({ tracking_number: trackingNumber }).toString()}`;

export const quoteFee = (spec: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>): CarrierQuote => ({
  feeVnd: estimateShippingFeeVnd(spec),
  billableWeightGram: billableWeightGram(spec),
  basis: 'estimate-v1',
});

export const fakeWaybill = (requestKey: string): CarrierWaybill => {
  const digits = BigInt(`0x${crypto.createHash('sha256').update(requestKey).digest('hex').slice(0, 15)}`)
    .toString()
    .padStart(12, '0')
    .slice(-12);
  const trackingNumber = `SPXVN${digits}`;
  return { carrierOrderId: `FAKE-${digits}`, trackingNumber, trackingUrl: trackingUrl(trackingNumber) };
};

// SPX status codes as our internal statuses. Unknown codes are recorded but change nothing.
const STATUS_MAP: Record<string, ShipmentStatus> = {
  created: 'CREATED',
  pending_pickup: 'AWAITING_PICKUP',
  awaiting_pickup: 'AWAITING_PICKUP',
  picked_up: 'PICKED_UP',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivering: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  delivery_failed: 'DELIVERY_FAILED',
  failed_delivery: 'DELIVERY_FAILED',
  returning: 'RETURNING',
  returned: 'RETURNED',
  cancelled: 'CANCELLED',
};
export const mapCarrierStatus = (code: unknown): ShipmentStatus | null =>
  typeof code === 'string' ? STATUS_MAP[code.trim().toLowerCase()] ?? null : null;

// Webhook authenticity: HMAC-SHA256 of the raw body with SPX_WEBHOOK_SECRET, hex, in X-Spx-Signature. Without a
// secret the webhook is closed.
export const verifyWebhookSignature = (rawBody: Buffer | undefined, signature: unknown) => {
  const secret = env('SPX_WEBHOOK_SECRET');
  if (!secret || !rawBody || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
};
