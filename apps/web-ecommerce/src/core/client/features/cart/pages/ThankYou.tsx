'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import OrderApi from '@/core/client/api/Order';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderDetails from '@/core/client/features/account/components/OrderDetails';
import type { Order } from '@/shared/types/order';
import { trackPurchase } from '@/shared/client/utils/tracking';

const ThankYou = () => {
  const searchParams = useSearchParams();
  const orderId = Number(searchParams.get('orderId'));
  const [order, setOrder] = useState<Order | null>();

  useEffect(() => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setOrder(null);
      return;
    }
    OrderApi.getMyOrder(orderId).then((result) => {
      setOrder(result ?? null);
      // Once per order in this tab (a reload does not count it again); the order id is the event id.
      const key = `tracked-order-${orderId}`;
      if (result && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        trackPurchase(
          result.id,
          result.total,
          (result.items ?? []).map((item) => ({
            id: String(item.productId),
            name: item.productName,
            price: item.unitPrice,
            quantity: item.quantity,
          })),
        );
      }
    });
  }, [orderId]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <svg
            className="h-9 w-9"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <h1 className="mb-3 text-3xl font-bold">Cảm ơn bạn đã đặt hàng!</h1>
        <p className="text-body dark:text-store-muted">
          Đơn hàng của bạn đã được ghi nhận và đang được xử lý. Chúng tôi sẽ liên hệ khi giao hàng.
        </p>
      </div>

      {order === undefined && (
        <div className="flex justify-center py-10">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      )}
      {order && (
        <section className="rounded-md border border-stroke p-6 dark:border-store-card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Đơn hàng #{order.id}</h2>
            <OrderStatusBadge status={order.status} />
          </div>
          <OrderDetails order={order} />
        </section>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link
          href="/order-history"
          className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
        >
          Xem lịch sử đơn hàng
        </Link>
        <Link
          href="/shop"
          className="rounded-md bg-gray px-6 py-3 font-semibold text-black hover:opacity-90 dark:bg-store-card dark:text-store-text"
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    </div>
  );
};

export default ThankYou;
