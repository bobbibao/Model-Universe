'use client';

import { useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import OrderApi from '@/core/client/api/Order';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderDetails from '@/core/client/features/account/components/OrderDetails';
import type { Order } from '@/shared/types/order';
import { trackPurchase } from '@/shared/client/utils/tracking';
import SuccessSignal from '@/components/SuccessSignal';

const ThankYou = () => {
  const t = useTranslations('checkout');
  const searchParams = useSearchParams();
  const orderId = Number(searchParams.get('orderId'));
  const [order, setOrder] = useState<Order | null>();
  const payment = useTranslations('fulfillment.payment'),
    locale = useLocale();
  const outcome = searchParams.get('payment');
  const [online, setOnline] = useState<{ paid: boolean; onlinePayment: boolean }>();
  const [opening, setOpening] = useState(false);
  // Back from payOS: ask the server to confirm with payOS (the webhook may not have arrived yet).
  useEffect(() => {
    if (!Number.isInteger(orderId) || orderId <= 0) return;
    let active = true;
    void OrderApi.paymentStatus(orderId).then(async (status) => {
      if (!active || !status) return;
      setOnline(status);
      if (status.paid) setOrder((await OrderApi.getMyOrder(orderId)) ?? null);
    });
    return () => {
      active = false;
    };
  }, [orderId, outcome]);
  const payNow = async () => {
    setOpening(true);
    const link = await OrderApi.paymentLink(orderId, locale);
    if (link) window.location.assign(link.checkoutUrl);
    else setOpening(false);
  };

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
        {order && <SuccessSignal />}
        <h1 className="mb-3 text-3xl font-bold">{order ? t('thankYou') : t('title')}</h1>
        <p className="text-body dark:text-store-muted">{order ? t('thankYouNote') : t('validationOrder')}</p>
      </div>

      {order === undefined && (
        <div className="flex justify-center py-10">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      )}
      {order && order.status === 'PROCESSING' && order.paymentPlan && online && (
        <div className="mb-6 rounded-md border border-dashed border-brand-hover p-4 text-center" role="status">
          {online.paid ? (
            <p className="font-semibold">{payment('paid')}</p>
          ) : (
            <>
              <p>{payment(outcome === 'cancel' ? 'cancelled' : outcome === 'return' ? 'pending' : 'due')}</p>
              {online.onlinePayment && (
                <button className="mu-button mt-3" disabled={opening} onClick={() => void payNow()}>
                  {payment('payNow')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {order && (
        <section className="rounded-md border border-stroke p-6 dark:border-store-card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t('orderNumber', { id: order.id })}</h2>
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
          {t('history')}
        </Link>
        <Link
          href="/shop"
          className="rounded-md bg-gray px-6 py-3 font-semibold text-black hover:opacity-90 dark:bg-store-card dark:text-store-text"
        >
          {t('continue')}
        </Link>
      </div>
    </div>
  );
};

export default ThankYou;
