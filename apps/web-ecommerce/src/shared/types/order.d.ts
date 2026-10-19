import type {
  FulfillmentMethod,
  OrderMeeting,
  PackageSpec,
  ShipmentStatus,
  ShippingFeePayer,
  ShippingQuoteSnapshot,
} from '../fulfillment';
import type { CancelRequest } from '../cancellation';

export type OrderStatus = 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'PAID';

export type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  imageUrl: string;
  size: string;
  quantity: number;
  unitPrice: number;
  modelSnapshot?: Record<string, unknown> | null;
};

export type ShippingInfo = {
  recipientName: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  note: string;
};

export type Order = {
  id: number;
  userId: number;
  status: OrderStatus;
  paymentMethod: 'COD';
  paymentStatus: PaymentStatus;
  requiresCollectionConfirmation?: boolean;
  collectionReceipt?: { amountVnd: number; externalReference: string; reason: string; createdAt: string } | null;
  subtotal: number;
  discount: number;
  shippingFee: number;
  tax: number;
  total: number;
  prepaidVnd?: number;
  paymentSource?: string | null;
  paymentPlan?: 'deposit' | 'full' | null;
  upfrontDueVnd?: number;
  // While the upfront transfer is outstanding: amount, memo and the shop's receiving account (null if not set).
  transferInstructions?: {
    amountVnd: number;
    memo: string;
    account: { bankName: string; accountNumber: string; accountHolder: string } | null;
  } | null;
  prepayments?: OrderPrepayment[];
  fulfillmentMethod?: FulfillmentMethod | null;
  shippingFeePayer?: ShippingFeePayer | null;
  estimatedShippingFeeVnd?: number;
  meeting?: OrderMeeting | null;
  provinceCode?: string | null;
  districtCode?: string | null;
  communeCode?: string | null;
  shippingQuote?: ShippingQuoteSnapshot | null;
  cancelReason?: string | null;
  cancelNote?: string | null;
  cancelledBy?: 'customer' | 'staff' | 'system' | null;
  cancelledAt?: string | null;
  cancelRequest?: CancelRequest | null;
  latitude?: number | null;
  longitude?: number | null;
  handoverCode?: string | null;
  shipments?: OrderShipment[];
  notifications?: {
    alerts: { id: number; kind: string; title: string; content: string; status: string; createdAt: string }[];
    notifications: { id: number; kind: string; createdAt: string; readAt: string | null }[];
    deliveries: {
      id: number;
      channel: string;
      sourceType: string;
      sourceId: number;
      recipient: string;
      subject: string;
      status: string;
      attemptCount: number;
      lastError: string | null;
      createdAt: string;
    }[];
  };
  couponCode?: string | null;
  benefitSnapshot?: Record<string, unknown> | null;
  recipientName: string;
  phone: string;
  address: string;
  ward?: string | null;
  district?: string | null;
  city: string;
  note?: string | null;
  deliveredAt?: string | null;
  // Unpaid orders must be paid by then (cancelled automatically afterwards).
  paymentDueAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  user?: { id: number; firstName: string; lastName: string; email: string; phone?: string | null };
};

export type CouponPreview = {
  code: string;
  title: string;
  description?: string | null;
  discountPercent: number;
  fixedAmountVnd?: number;
  maxDiscountVnd?: number | null;
  // The order subtotal needed to use it (whole VND); 0 = no minimum.
  minOrderVnd: number;
  expirationDate: string;
};

export type VoucherTermsInput = {
  kind?: 'standard' | 'member_template';
  profitGuard?: boolean;
  maxDiscountVnd?: number | null;
  eligibleSkus?: string[] | null;
  excludedSkus?: string[] | null;
  cartType?: 'any' | 'single' | 'basket';
  budgetVnd?: number | null;
  isPublic?: boolean;
};

export type Coupon = CouponPreview &
  VoucherTermsInput & {
    source?: 'admin' | 'agent' | 'loyalty' | 'member';
    budgetUsedVnd?: number;
    reservedOrderId?: number | null;
    usedAt?: string | null;
    id: number;
    usageLimit: number | null;
    usageCount: number;
    startDate: string;
    isActive: boolean;
  };

export type CouponInput = VoucherTermsInput & {
  code: string;
  title: string;
  description: string;
  discountPercent: number;
  usageLimit: number | null;
  minOrderVnd: number;
  startDate: string;
  expirationDate: string;
  isActive: boolean;
};

export interface OrderShipment {
  id: number;
  carrier: string;
  carrierId?: number | null;
  carrierName?: string | null;
  carrierCode?: string | null;
  mode: 'live' | 'simulate' | 'fake' | 'manual';
  carrierOrderId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  packageSnapshot: PackageSpec;
  shippingFeeVnd: number;
  feePayer: ShippingFeePayer;
  codAmountVnd: number;
  productBalanceVnd: number;
  status: ShipmentStatus;
  failureReason: string | null;
  carrierStatus?: string | null;
  expectedDeliveryAt?: string | null;
  createdAt: string;
  events?: { id: number; status: ShipmentStatus; applied: boolean; reason: string | null; createdAt: string }[];
}

export interface OrderPrepayment {
  id: number;
  kind: 'receipt' | 'topup' | 'refund';
  amountVnd: number;
  externalReference: string;
  reason: string;
  createdAt: string;
}
