import type { OrderStatus, PaymentStatus } from '@/shared/types/order';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã huỷ',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Chưa thanh toán',
  PAID: 'Đã thanh toán',
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PROCESSING: 'bg-warning/10 text-warning',
  SHIPPED: 'bg-meta-5/10 text-meta-5',
  DELIVERED: 'bg-success/10 text-success',
  CANCELLED: 'bg-danger/10 text-danger',
};

const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}
  >
    {ORDER_STATUS_LABELS[status]}
  </span>
);

export default OrderStatusBadge;
