'use client';

import { useTranslations } from 'next-intl';
import type { OrderStatus, PaymentStatus } from '@/shared/types/order';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Awaiting collection',
  PAID: 'Paid',
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PROCESSING: 'bg-warning/10 text-warning',
  SHIPPED: 'bg-meta-5/10 text-meta-5',
  DELIVERED: 'bg-success/10 text-success',
  CANCELLED: 'bg-danger/10 text-danger',
};

const OrderStatusBadge = ({ status }: { status: OrderStatus }) => {
  const t = useTranslations('checkout.orderStatus');
  return (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}
  >
    {t(status)}
  </span>
  );
};

export default OrderStatusBadge;
