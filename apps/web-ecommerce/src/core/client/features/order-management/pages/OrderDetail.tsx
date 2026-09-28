'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import OrderStatusBadge, { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/components/OrderStatusBadge';
import ProductImage from '@/components/ProductImage';
import OrderApi from '@/core/client/api/Order';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order, OrderStatus } from '@/shared/types/order';

// Next step of the "Process order" button (PROCESSING → SHIPPED → DELIVERED).
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PROCESSING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

const InfoRow = ({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'text-lg font-bold text-black dark:text-white' : ''}`}>
    <span className="text-body">{label}</span>
    <span className="text-right">{value}</span>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
    <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">{title}</h3>
    {children}
  </section>
);

const OrderDetail = () => {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);

  useEffect(() => {
    OrderApi.getOrder(orderId).then((result) => setOrder(result ?? null));
  }, [orderId]);

  const changeStatus = async () => {
    if (!pendingStatus) return;
    const updated = await OrderApi.updateStatus(orderId, pendingStatus);
    if (updated) setOrder(updated);
    setPendingStatus(null);
  };

  if (order === undefined) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">Không tìm thấy đơn hàng.</p>
        <Link href="/admin/orders" className="font-medium text-brand-hover hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const nextStatus = NEXT_STATUS[order.status];

  return (
    <>
      <Breadcrumb pageName={`Đơn hàng #${order.id}`} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Sản phẩm trong đơn">
            <div className="flex flex-col divide-y divide-stroke dark:divide-strokedark">
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex items-center gap-4 py-3">
                  <span className="relative h-16 w-14 shrink-0 overflow-hidden rounded bg-gray-2 dark:bg-meta-4">
                    <ProductImage src={item.imageUrl} alt={item.productName} sizes="56px" />
                  </span>
                  <div className="flex-1">
                    <Link href={`/admin/products/${item.productId}`} className="font-medium hover:text-brand-hover">
                      {item.productName}
                    </Link>
                    {item.size && <p className="text-sm text-body">Kích thước: {item.size}</p>}
                  </div>
                  <p className="text-right">
                    {formatVND(item.unitPrice)} × {item.quantity} ={' '}
                    <span className="font-semibold">{formatVND(item.unitPrice * item.quantity)}</span>
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Thông tin khách hàng">
            <InfoRow label="Tài khoản" value={order.user ? `${order.user.lastName} ${order.user.firstName}` : '—'} />
            <InfoRow label="Email" value={order.user?.email || '—'} />
            <InfoRow label="Người nhận" value={order.recipientName} />
            <InfoRow label="Số điện thoại" value={order.phone} />
            <InfoRow label="Địa chỉ" value={order.address} />
            <InfoRow label="Phường/Xã" value={order.ward || '—'} />
            <InfoRow label="Quận/Huyện" value={order.district || '—'} />
            <InfoRow label="Tỉnh/Thành phố" value={order.city} />
            {order.note && <InfoRow label="Ghi chú" value={order.note} />}
          </Card>

          <Card title="Thanh toán">
            <InfoRow label="Tổng tiền hàng" value={formatVND(order.subtotal)} />
            <InfoRow label="Phí giao hàng" value={order.shippingFee > 0 ? formatVND(order.shippingFee) : 'Miễn phí'} />
            <InfoRow label="Thuế" value={formatVND(order.tax)} />
            <InfoRow
              label="Giảm giá"
              value={order.discount > 0 ? `-${formatVND(order.discount)} (${order.couponCode})` : '—'}
            />
            <InfoRow label="Tổng thanh toán" value={formatVND(order.total)} strong />
            <InfoRow label="Phương thức" value="Thanh toán khi nhận hàng (COD)" />
            <InfoRow label="Trạng thái thanh toán" value={PAYMENT_STATUS_LABELS[order.paymentStatus]} />
          </Card>

          <Card title="Trạng thái">
            <div className="mb-4 flex items-center justify-between">
              <OrderStatusBadge status={order.status} />
              <span className="text-sm text-body">Cập nhật: {new Date(order.updatedAt).toLocaleString('vi-VN')}</span>
            </div>
            <div className="flex flex-col gap-3">
              {nextStatus && (
                <button
                  onClick={() => setPendingStatus(nextStatus)}
                  className="rounded-md bg-brand px-4 py-2.5 font-semibold text-brand-ink hover:bg-brand-hover"
                >
                  Xử lý đơn: chuyển sang &quot;{ORDER_STATUS_LABELS[nextStatus]}&quot;
                </button>
              )}
              {order.status === 'PROCESSING' && (
                <button
                  onClick={() => setPendingStatus('CANCELLED')}
                  className="rounded-md border border-danger px-4 py-2.5 font-medium text-danger hover:bg-danger hover:text-white"
                >
                  Huỷ đơn hàng
                </button>
              )}
              {!nextStatus && order.status !== 'PROCESSING' && (
                <p className="text-sm text-body">Đơn hàng đã hoàn tất xử lý.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={!!pendingStatus}
        title="Thay đổi trạng thái đơn hàng"
        message={
          pendingStatus === 'CANCELLED' ? (
            <>Huỷ đơn hàng #{order.id}? Số lượng sản phẩm sẽ được hoàn lại kho.</>
          ) : (
            <>
              Chuyển đơn hàng #{order.id} sang &quot;{pendingStatus && ORDER_STATUS_LABELS[pendingStatus]}&quot;?
            </>
          )
        }
        confirmLabel="Xác nhận"
        danger={pendingStatus === 'CANCELLED'}
        onConfirm={changeStatus}
        onClose={() => setPendingStatus(null)}
      />
    </>
  );
};

export default OrderDetail;
