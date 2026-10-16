// Deposit orders and automatic delivery (docs/business/deposit-delivery-specification.md). A customer pays at least 10%
// upfront and either meets the shop in person (DIRECT_MEETING, "GDTT") or receives the parcel by SPX with the balance
// collected on delivery (SPX_COD). Shared by the server and the client; whole VND only.

export const FULFILLMENT_METHODS = ['SPX_COD', 'DIRECT_MEETING'] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];
export const isFulfillmentMethod = (value: unknown): value is FulfillmentMethod =>
  typeof value === 'string' && (FULFILLMENT_METHODS as readonly string[]).includes(value);

// Who pays the carrier's fee. `cod` adds it to the amount SPX collects (the customer agreed at checkout); `shop` means
// the shop carries it. The product balance is never changed by the fee.
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

// Internal shipment statuses, mapped from the carrier's own events.
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
];
// Which status may follow which (a repeated or out-of-order carrier event changes nothing).
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  CREATED: ['AWAITING_PICKUP', 'PICKED_UP', 'CANCELLED'],
  AWAITING_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'IN_TRANSIT', 'RETURNING'],
  DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'IN_TRANSIT', 'RETURNING', 'DELIVERED'],
  RETURNING: ['RETURNED'],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

export interface PackageSpec {
  weightGram: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  fragile: boolean;
  declaredValueVnd: number;
  note?: string | null;
}

// remaining_product_amount = MAX(0, product_total − confirmed_paid)
export const remainingProductVnd = (productTotalVnd: number, confirmedPaidVnd: number) =>
  Math.max(0, productTotalVnd - confirmedPaidVnd);

// cod_amount = remaining product amount + the carrier fee when the customer agreed to pay it on delivery.
export const codAmountVnd = (
  productTotalVnd: number,
  confirmedPaidVnd: number,
  shippingFeeVnd: number,
  feePayer: ShippingFeePayer,
) => remainingProductVnd(productTotalVnd, confirmedPaidVnd) + (feePayer === 'cod' ? shippingFeeVnd : 0);

// The billable weight carriers use: the larger of the actual weight and the volumetric weight (L×W×H / 6000 kg).
export const billableWeightGram = (spec: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>) =>
  Math.max(spec.weightGram, Math.ceil((spec.lengthCm * spec.widthCm * spec.heightCm) / 6));

// A conservative default box for one boxed kit, used for the checkout estimate before staff confirm the package.
export const DEFAULT_PACKAGE: PackageSpec = {
  weightGram: 1200,
  lengthCm: 40,
  widthCm: 30,
  heightCm: 15,
  fragile: true,
  declaredValueVnd: 0,
};

// Vietnam business dates for appointments: today (Asia/Ho_Chi_Minh) as YYYY-MM-DD.
export const vnDate = (instant = new Date()) =>
  new Date(instant.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

// Published-rate approximation (SPX standard): 22,000 VND up to 500 g, then 5,000 VND per started 500 g of billable
// weight. Checkout shows it as an estimate; the waybill records the fee staff confirm or the carrier returns.
export const estimateShippingFeeVnd = (spec: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>) => {
  const weight = billableWeightGram(spec);
  return 22_000 + Math.max(0, Math.ceil((weight - 500) / 500)) * 5_000;
};

// The checkout estimate for a number of boxed kits (the default box per kit, at most 20 kits per parcel estimate).
export const checkoutShippingEstimateVnd = (units: number) =>
  estimateShippingFeeVnd({ ...DEFAULT_PACKAGE, weightGram: DEFAULT_PACKAGE.weightGram * Math.min(Math.max(units, 1), 20) });
