import type { PackagePlanSnapshot } from './packing/plan';

// Deposit orders and automatic delivery (docs/business/deposit-delivery-specification.md). A customer pays at least 10%
// of the merchandise upfront (online with payOS, or a verified bank transfer) and either receives the parcel through
// SuperAI with the rest collected on delivery (COURIER_COD) or meets the shop in person (DIRECT_MEETING, "GDTT").
// SuperAI quotes every connected carrier for the address; checkout takes the cheapest and its fee is part of the order
// total. Shared by the server and the client; whole VND only.

export const FULFILLMENT_METHODS = ['COURIER_COD', 'DIRECT_MEETING'] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];
export const isFulfillmentMethod = (value: unknown): value is FulfillmentMethod =>
  typeof value === 'string' && (FULFILLMENT_METHODS as readonly string[]).includes(value);

// Who pays the carrier. `shop` (SuperAI payer 1): the shop pays the carrier and the customer pays the fee as part of
// the order total. `cod` is kept for waybills recorded before the fee moved into the order total.
export const SHIPPING_FEE_PAYERS = ['cod', 'shop'] as const;
export type ShippingFeePayer = (typeof SHIPPING_FEE_PAYERS)[number];

export const MEETING_SLOTS = ['09-12', '12-15', '15-18', '18-21'] as const;
export type MeetingSlot = (typeof MEETING_SLOTS)[number];

export const MEETING_STATUSES = [
  'WAITING_FOR_APPOINTMENT',
  'CHANGE_REQUESTED',
  'APPOINTMENT_CONFIRMED',
  'COMPLETED',
  'NOT_HELD',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface MeetingRequest {
  address: string;
  city: string;
  date: string; // YYYY-MM-DD, Vietnam business date
  slot: MeetingSlot;
  note?: string | null;
}

export interface OrderMeeting {
  status: MeetingStatus;
  requested: MeetingRequest;
  // The latest change the customer asked for; it takes effect only after the shop confirms it.
  changeRequest: MeetingRequest | null;
  confirmedAddress: string | null;
  confirmedAt: string | null; // the appointment time (ISO instant)
  confirmedByUserId: number | null;
  handoverAt: string | null;
  handoverByUserId: number | null;
  history: { at: string; actorUserId: number; action: string; details: Record<string, unknown> }[];
}

// A delivery address as SuperAI's area master data names it: province → district → commune (the three-level units
// carriers still route by), with SuperAI's codes, plus the street line and an optional map position.
export interface DeliveryAddress {
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  communeCode: string;
  communeName: string;
  street: string;
  latitude?: number | null;
  longitude?: number | null;
}

export const formatDeliveryAddress = (address: Partial<DeliveryAddress>) =>
  [address.street, address.communeName, address.districtName, address.provinceName].filter(Boolean).join(', ');

const plainText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Vietnamese mobile numbers written as +84 / 84 / 0 are the same number.
export const plainPhone = (value: string | null | undefined) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.startsWith('84') && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
};
// What makes two saved addresses the same place for the same person, however they were saved (address book, checkout):
// recipient, phone, commune (SuperAI code, or the ward/district/city text of an older address) and street line.
export const savedAddressKey = (
  shipping: { recipientName?: string | null; phone?: string | null; address?: string | null; ward?: string | null; district?: string | null; city?: string | null },
  delivery?: Partial<DeliveryAddress> | null,
) =>
  JSON.stringify([
    plainText(shipping.recipientName),
    plainPhone(shipping.phone),
    delivery?.communeCode || [shipping.ward, shipping.district, shipping.city].map(plainText).join('|'),
    plainText(delivery?.street ?? shipping.address),
  ]);

// One carrier's price for a parcel (SuperAI `orders/price`): delivery fee plus insurance for the declared value.
export interface CarrierQuote {
  carrierId: number;
  carrierName: string;
  shipmentFeeVnd: number;
  insuranceFeeVnd: number;
  feeVnd: number;
  estimatedPickup: string | null;
  estimatedDelivery: string | null;
}

// The carrier checkout chose for a parcel (the cheapest SuperAI quote, or a local estimate without SuperAI) and every
// price it saw; frozen on the checkout session and the order.
export interface ShippingQuoteSnapshot {
  feeVnd: number;
  carrier: CarrierQuote | null;
  options: CarrierQuote[];
  weightGram: number;
  source: 'superai' | 'estimate';
  // How the order is packed (one or more parcels); absent on quotes made before the package optimizer. A carrier
  // quote of a multi-parcel plan adds up its parcels.
  plan?: PackagePlanSnapshot;
}

// The upper bound in days of a SuperAI estimate such as "Khoảng 2.1 - 2.6 ngày" (Infinity when unknown).
export const estimateDays = (text: string | null | undefined) => {
  const numbers = (text || '').match(/\d+(?:[.,]\d+)?/g)?.map((value) => Number(value.replace(',', '.'))) || [];
  return numbers.length ? Math.max(...numbers) : Number.POSITIVE_INFINITY;
};

// The cheapest carrier (fee + insurance); on a tie the faster estimate, then the lower carrier id (deterministic).
export const cheapestCarrier = (quotes: readonly CarrierQuote[]): CarrierQuote | null =>
  [...quotes]
    .filter((quote) => Number.isSafeInteger(quote.feeVnd) && quote.feeVnd > 0)
    .sort(
      (a, b) =>
        a.feeVnd - b.feeVnd ||
        estimateDays(a.estimatedDelivery) - estimateDays(b.estimatedDelivery) ||
        a.carrierId - b.carrierId,
    )[0] ?? null;

// Internal shipment statuses, mapped from the carrier's own events (SuperAI status codes in SuperAiClient).
export const SHIPMENT_STATUSES = [
  'CREATED',
  'AWAITING_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING',
  'RETURNED',
  'CANCELLED',
  'EXCEPTION', // lost, not picked up, partly delivered or an incident the carrier handles manually
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const isShipmentStatus = (value: unknown): value is ShipmentStatus =>
  typeof value === 'string' && (SHIPMENT_STATUSES as readonly string[]).includes(value);
// A shipment in one of these states blocks creating another one for the same delivery.
export const ACTIVE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'CREATED',
  'AWAITING_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING',
  'EXCEPTION',
];
export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];
// Which status staff may record after which (simulation and manual corrections). Carrier events are applied unless
// the shipment is already final, because carriers may skip intermediate states.
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  CREATED: ['AWAITING_PICKUP', 'PICKED_UP', 'CANCELLED'],
  AWAITING_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING', 'EXCEPTION'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'IN_TRANSIT', 'RETURNING', 'EXCEPTION'],
  DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'IN_TRANSIT', 'RETURNING', 'DELIVERED', 'EXCEPTION'],
  RETURNING: ['RETURNED', 'EXCEPTION'],
  EXCEPTION: ['RETURNING', 'RETURNED', 'DELIVERED'],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};
// The customer-facing progress steps of the tracking view.
export const TRACKING_STEPS: readonly ShipmentStatus[] = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export interface PackageSpec {
  weightGram: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  fragile: boolean;
  declaredValueVnd: number;
  note?: string | null;
}

// remaining_product_amount = MAX(0, order_total − confirmed_paid)
export const remainingProductVnd = (productTotalVnd: number, confirmedPaidVnd: number) =>
  Math.max(0, productTotalVnd - confirmedPaidVnd);

// cod_amount = what the order still owes (+ a fee the customer pays on delivery, only for legacy `cod` waybills).
export const codAmountVnd = (
  productTotalVnd: number,
  confirmedPaidVnd: number,
  shippingFeeVnd: number,
  feePayer: ShippingFeePayer,
) => remainingProductVnd(productTotalVnd, confirmedPaidVnd) + (feePayer === 'cod' ? shippingFeeVnd : 0);

// The billable weight carriers use: the larger of the actual weight and the volumetric weight (L×W×H / 5000 kg).
export const billableWeightGram = (spec: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>) =>
  Math.max(spec.weightGram, Math.ceil((spec.lengthCm * spec.widthCm * spec.heightCm) / 5));

// A conservative default box for one boxed kit, used for quotes before staff confirm the package.
export const DEFAULT_PACKAGE: PackageSpec = {
  weightGram: 1200,
  lengthCm: 40,
  widthCm: 30,
  heightCm: 15,
  fragile: true,
  declaredValueVnd: 0,
};

// The package of an order of `units` boxed kits for a quote (stacked boxes, capped at common single-parcel limits).
export const packageForUnits = (units: number): PackageSpec => {
  const count = Math.min(Math.max(units, 1), 20);
  return {
    ...DEFAULT_PACKAGE,
    weightGram: DEFAULT_PACKAGE.weightGram * count,
    heightCm: Math.min(200, DEFAULT_PACKAGE.heightCm * count),
  };
};

// Local approximation used only when no carrier quote is available (simulation and tests): 22,000 VND up to 500 g,
// then 5,000 VND per started 500 g.
export const estimateFeeByWeightVnd = (billableGram: number) =>
  22_000 + Math.max(0, Math.ceil((billableGram - 500) / 500)) * 5_000;
export const estimateShippingFeeVnd = (spec: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>) =>
  estimateFeeByWeightVnd(billableWeightGram(spec));

// Vietnam business dates for appointments: today (Asia/Ho_Chi_Minh) as YYYY-MM-DD.
export const vnDate = (instant = new Date()) => new Date(instant.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
