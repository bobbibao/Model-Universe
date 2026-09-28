import Link from 'next/link';
import ProductImage from '@/components/ProductImage';
import { PAYMENT_STATUS_LABELS } from '@/components/OrderStatusBadge';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order } from '@/shared/types/order';

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'text-lg font-bold' : ''}`}>
    <span className="text-body dark:text-store-muted">{label}</span>
    <span className={strong ? 'text-danger' : ''}>{value}</span>
  </div>
);

export const formatOrderAddress = (order: Order) =>
  [order.address, order.ward, order.district, order.city].filter(Boolean).join(', ');

// Items, amounts and delivery details of a customer order.
const OrderDetails = ({ order }: { order: Order }) => (
  <div className="flex flex-col gap-6">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-stroke text-sm text-body dark:border-store-card dark:text-store-muted">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Sản phẩm</th>
            <th className="py-2 pr-3">Kích thước</th>
            <th className="py-2 pr-3">Số lượng</th>
            <th className="py-2 text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item, index) => (
            <tr key={item.id} className="border-b border-stroke dark:border-store-card">
              <td className="py-3 pr-3">{index + 1}</td>
              <td className="py-3 pr-3">
                <Link
                  href={`/shop/product/${item.productId}`}
                  className="flex items-center gap-3 hover:text-brand-hover"
                >
                  <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded bg-gray-2 dark:bg-store-card">
                    <ProductImage src={item.imageUrl} alt={item.productName} sizes="48px" />
                  </span>
                  <span>{item.productName}</span>
                </Link>
              </td>
              <td className="py-3 pr-3">{item.size || '—'}</td>
              <td className="py-3 pr-3">
                {item.quantity} × {formatVND(item.unitPrice)}
              </td>
              <td className="py-3 text-right font-semibold">{formatVND(item.unitPrice * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h4 className="mb-2 font-semibold">Thông tin giao hàng</h4>
        <p>{order.recipientName}</p>
        <p>{order.phone}</p>
        <p>{formatOrderAddress(order)}</p>
        {order.note && <p className="mt-1 text-sm text-body dark:text-store-muted">Ghi chú: {order.note}</p>}
        <p className="mt-2 text-sm">Thanh toán khi nhận hàng (COD) · {PAYMENT_STATUS_LABELS[order.paymentStatus]}</p>
      </div>
      <div>
        <Row label="Tổng tiền hàng" value={formatVND(order.subtotal)} />
        <Row label="Phí giao hàng" value={order.shippingFee > 0 ? formatVND(order.shippingFee) : 'Miễn phí'} />
        <Row
          label="Giảm giá"
          value={order.discount > 0 ? `-${formatVND(order.discount)} (${order.couponCode})` : 'Chưa áp dụng'}
        />
        <Row label="Tổng thanh toán" value={formatVND(order.total)} strong />
      </div>
    </div>
  </div>
);

export default OrderDetails;
