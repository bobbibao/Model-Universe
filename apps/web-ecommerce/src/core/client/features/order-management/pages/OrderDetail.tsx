'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from '@/i18n/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderDetails from '@/core/client/features/account/components/OrderDetails';
import OrderApi from '@/core/client/api/Order';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order, OrderStatus } from '@/shared/types/order';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>(),
    orderId = Number(id);
  const t = useTranslations('orderOperations'),
    checkout = useTranslations('checkout'),
    common = useTranslations('common'),
    locale = useLocale();
  const [order, setOrder] = useState<Order | null>(),
    [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setOrder(undefined);
    void OrderApi.getOrder(orderId).then((value) => setOrder(value || null));
  }, [orderId]);
  const changeStatus = async () => {
    if (!pendingStatus) return;
    const result = await OrderApi.updateStatus(orderId, pendingStatus);
    if (result) setOrder(result);
    setPendingStatus(null);
  };
  const collect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await OrderApi.confirmCollection(orderId, {
        amountVnd: Number(form.get('amountVnd')),
        externalReference: String(form.get('externalReference')),
        reason: String(form.get('reason')),
        moneyVerified: form.has('moneyVerified'),
      });
      if (result) setOrder(result);
    } finally {
      setBusy(false);
    }
  };
  if (order === undefined)
    return (
      <p className="mu-note p-8" role="status">
        {common('loading')}
      </p>
    );
  if (!order)
    return (
      <section className="mu-panel p-8">
        <p>{t('missing')}</p>
        <Link href="/admin/orders" className="underline">
          {t('back')}
        </Link>
      </section>
    );
  const next = NEXT_STATUS[order.status];
  return (
    <>
      <Breadcrumb pageName={checkout('orderNumber', { id: order.id })} />
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="mu-panel p-5 xl:col-span-2">
          <OrderDetails order={order} />
          {order.user && (
            <p className="mu-note mt-5">
              {order.user.firstName} {order.user.lastName} · {order.user.email}
            </p>
          )}
        </section>
        <div className="space-y-6">
          <section className="mu-panel space-y-4 p-5">
            <h2 className="text-xl font-bold">{t('fulfillment')}</h2>
            <OrderStatusBadge status={order.status} />
            <p className="mu-note">{t('updated', { date: new Date(order.updatedAt).toLocaleString(locale) })}</p>
            {next && (
              <button className="mu-button w-full" onClick={() => setPendingStatus(next)}>
                {t('advance', { status: checkout(`orderStatus.${next}`) })}
              </button>
            )}
            {order.status === 'PROCESSING' && (
              <button className="mu-button mu-button-secondary w-full" onClick={() => setPendingStatus('CANCELLED')}>
                {checkout('cancelOrder')}
              </button>
            )}
            <p className="mu-note">{t('deliveryIsNotPayment')}</p>
          </section>
          {order.status === 'DELIVERED' &&
            order.paymentStatus === 'PENDING' &&
            order.requiresCollectionConfirmation && (
              <form className="mu-panel space-y-4 p-5" onSubmit={(event) => void collect(event)}>
                <h2 className="text-xl font-bold">{t('collection')}</h2>
                <p className="mu-note">{t('collectionNote')}</p>
                <label className="mu-field">
                  {t('amount')}
                  <input
                    name="amountVnd"
                    type="number"
                    step="1"
                    min="1"
                    required
                    defaultValue={order.total - (order.prepaidVnd || 0)}
                  />
                </label>
                <label className="mu-field">
                  {t('reference')}
                  <input name="externalReference" minLength={8} maxLength={128} required />
                </label>
                <label className="mu-field">
                  {t('reason')}
                  <textarea name="reason" maxLength={1000} required />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input className="mt-1" name="moneyVerified" type="checkbox" required />
                  {t('verified')}
                </label>
                <button className="mu-button" disabled={busy}>
                  {common('confirm')}
                </button>
              </form>
            )}
          {order.collectionReceipt && (
            <section className="mu-panel p-5">
              <h2 className="font-bold">{t('collection')}</h2>
              <p className="mt-3">{formatVND(order.collectionReceipt.amountVnd, locale)}</p>
              <p className="mu-note break-all">{order.collectionReceipt.externalReference}</p>
              <p className="mu-note">{new Date(order.collectionReceipt.createdAt).toLocaleString(locale)}</p>
              <p className="mu-note">{order.collectionReceipt.reason}</p>
            </section>
          )}
        </div>
      </div>
      <ConfirmModal
        open={!!pendingStatus}
        title={t('confirmStatus')}
        message={
          pendingStatus ? t('statusMessage', { id: order.id, status: checkout(`orderStatus.${pendingStatus}`) }) : ''
        }
        confirmLabel={common('confirm')}
        danger={pendingStatus === 'CANCELLED'}
        onConfirm={changeStatus}
        onClose={() => setPendingStatus(null)}
      />
    </>
  );
}
