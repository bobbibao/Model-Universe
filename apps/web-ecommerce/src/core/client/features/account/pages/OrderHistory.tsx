'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import Link from '@/i18n/navigation';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderApi from '@/core/client/api/Order';
import StorePagination from '@/core/client/features/shop/components/StorePagination';
import { formatVND } from '@/shared/server/utils/utils';
import type { Pagination } from '@/shared/types/pagination';
import type { Order } from '@/shared/types/order';
import OrderDetails from '../components/OrderDetails';
import OrderReturns from '../components/OrderReturns';

const PAGE_SIZE = 5;

const OrderHistory = () => {
  const t = useTranslations('checkout'), locale = useLocale();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const result = await OrderApi.getMyOrders(page, PAGE_SIZE);
    setOrders(result?.data || []);
    setPagination(result?.pagination);
    setOpenId((current) => current ?? result?.data[0]?.id ?? null);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);
  useCustomerActionRefresh('cancel_order,return_request', loadOrders);

  const cancelOrder = async () => {
    if (!cancelling) return;
    const updated = await OrderApi.cancelMyOrder(cancelling.id);
    if (updated) setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
    setCancelling(null);
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex justify-center py-32">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h1 className="mb-4 text-3xl font-bold">{t('historyTitle')}</h1>
        <p className="mb-6 text-body dark:text-store-muted">{t('historyEmpty')}</p>
        <Link href="/shop" className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover">
          {t('continue')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">{t('historyTitle')}</h1>
      <div className="flex flex-col gap-4">
        {orders.map((order) => {
          const open = openId === order.id;
          return (
            <section key={order.id} className="overflow-hidden rounded-md border border-stroke dark:border-store-card">
              <button
                onClick={() => setOpenId(open ? null : order.id)}
                aria-expanded={open}
                className="flex w-full flex-wrap items-center justify-between gap-3 bg-gray-2 px-5 py-4 text-left dark:bg-store-panel"
              >
                <span className="font-semibold">
                  {t('orderNumber',{id:order.id})} · {new Date(order.createdAt).toLocaleString(locale)}
                </span>
                <span className="flex items-center gap-4">
                  <OrderStatusBadge status={order.status} />
                  <span className="font-bold">{formatVND(order.total,locale)}</span>
                  <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </span>
              </button>
              {open && (
                <div className="p-5">
                  <OrderDetails order={order} />
                  {order.status === 'DELIVERED' && <OrderReturns order={order} />}
                  {order.status === 'PROCESSING' && (
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => setCancelling(order)}
                        className="rounded-md border border-danger px-4 py-2 font-medium text-danger hover:bg-danger hover:text-white"
                      >
                        {t('cancelOrder')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <StorePagination
        pagination={pagination}
        onPageChange={(nextPage) => {
          setOpenId(null);
          setPage(nextPage);
        }}
      />

      <ConfirmModal
        open={!!cancelling}
        title={t('cancelOrder')}
        message={t('cancelOrderConfirm',{id:cancelling?.id || 0})}
        confirmLabel={t('cancelOrder')}
        danger
        onConfirm={cancelOrder}
        onClose={() => setCancelling(null)}
      />
    </div>
  );
};

export default OrderHistory;
