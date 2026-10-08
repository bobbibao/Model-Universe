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
  couponCode?: string | null;
  recipientName: string;
  phone: string;
  address: string;
  ward?: string | null;
  district?: string | null;
  city: string;
  note?: string | null;
  deliveredAt?: string | null;
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

export type Coupon = CouponPreview & {
  id: number;
  usageLimit: number | null;
  usageCount: number;
  startDate: string;
  isActive: boolean;
};

export type CouponInput = {
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
