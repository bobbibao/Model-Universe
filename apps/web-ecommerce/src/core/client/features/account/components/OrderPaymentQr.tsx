'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import OrderApi from '@/core/client/api/Order';
import PaymentQr, { clock, useCountdown, type QrPayment } from '@/components/Payment/PaymentQr';
import type { Order } from '@/shared/types/order';

type LinkView = QrPayment & { expiresAt: string; serverTime: string };

// An order that still owes its deposit or full payment (placed by bank transfer, or before QR checkout existed): the
// open payOS QR with its countdown, until the order's payment deadline. Viewing the order shows the existing QR again
// and never starts a payment; a QR is created only when the customer asks for one, and never after the deadline (the
// order is then cancelled automatically and its stock released). The panel polls payOS while the QR is shown.
export default function OrderPaymentQr({ order, onChange }: { order: Order; onChange?: (order: Order) => void }) {
  const t = useTranslations('checkoutPayment'),
    locale = useLocale();
  const [link, setLink] = useState<LinkView | null>();
  const [online, setOnline] = useState(false);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const dueSeconds = useCountdown(dueAt, link?.serverTime);
  const [busy, setBusy] = useState(false);
  const seconds = useCountdown(link?.expiresAt, link?.serverTime);
  const due =
    order.status === 'PROCESSING' && !!order.paymentPlan && (order.prepaidVnd || 0) < (order.upfrontDueVnd || 0);

  useEffect(() => {
    if (!due) return;
    let active = true;
    void Api.get(`/orders/${order.id}/payment`)
      .then((response) => {
        if (!active) return;
        setOnline(!!response.data.onlinePayment);
        setDueAt(response.data.paymentDueAt || null);
        setLink(response.data.link);
      })
      .catch(() => active && setLink(null));
    return () => {
      active = false;
    };
  }, [order.id, due]);

  // While the QR is shown, ask payOS every few seconds; the paid order replaces this panel.
  useEffect(() => {
    if (!link || seconds === 0) return;
    const timer = setInterval(() => {
      void OrderApi.paymentStatus(order.id).then(async (status) => {
        if (!status?.paid) return;
        const fresh = await OrderApi.getMyOrder(order.id);
        if (fresh) onChange?.(fresh);
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [link, seconds === 0, order.id, onChange]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!due || !online || link === undefined) return null;
  const overdue = !!dueAt && new Date(dueAt).getTime() <= Date.now();
  if (overdue)
    return (
      <section className="order-payment-qr">
        <p>{t('orderOverdue')}</p>
      </section>
    );
  const show = async () => {
    setBusy(true);
    try {
      setLink((await Api.post(`/orders/${order.id}/payment-link`, { locale })).data);
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="order-payment-qr" aria-labelledby={`order-pay-${order.id}`}>
      <h3 id={`order-pay-${order.id}`}>{t(order.paymentPlan === 'full' ? 'orderDueFull' : 'orderDueDeposit')}</h3>
      {dueAt && (
        <p className="mu-note">
          {t('orderDeadline', { time: new Date(dueAt).toLocaleString(locale) })}
          {dueSeconds > 0 && dueSeconds < 3600 ? ` · ${t('timeLeft', { time: clock(dueSeconds) })}` : ''}
        </p>
      )}
      {link && seconds > 0 ? (
        <div className="checkout-qr">
          <PaymentQr payment={link} seconds={seconds} />
          <p className="checkout-qr-waiting">
            <span className="checkout-qr-dot" aria-hidden="true" />
            {t('waitingOrder')}
          </p>
        </div>
      ) : (
        <>
          <p className="mu-note">{t(link ? 'expiredOrder' : 'noQrYet')}</p>
          <button type="button" className="mu-button mt-2" disabled={busy} onClick={() => void show()}>
            {t('showQr')}
          </button>
        </>
      )}
    </section>
  );
}
