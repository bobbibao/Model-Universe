'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import OrderApi from '@/core/client/api/Order';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order } from '@/shared/types/order';

interface Entry {
  key: string;
  at: string;
  title: string;
  detail?: string | null;
  tone?: 'done' | 'warn' | 'bad';
}

// Order tracking on the purchases page, laid out like a marketplace's: the carrier and the waybill code (copy it, or
// look it up on the carrier's site), what the courier collects, the delivery estimate, and one timeline of everything
// that happened (placed, paid, every carrier event, cancellation), newest first.
export default function ShipmentTracking({ order, onChange }: { order: Order; onChange?: (order: Order) => void }) {
  const t = useTranslations('purchases'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [busy, setBusy] = useState(false);
  const shipment = order.shipments?.filter((row) => row.status !== 'CANCELLED').at(-1) ?? order.shipments?.at(-1);
  const code = shipment ? shipment.carrierCode || shipment.trackingNumber || '' : '';
  const carrier = shipment?.carrierName || shipment?.carrier || order.shippingQuote?.carrier?.carrierName || '';
  const estimate = order.shippingQuote?.carrier?.estimatedDelivery;

  const entries: Entry[] = [{ key: 'placed', at: order.createdAt, title: t('timeline.placed') }];
  for (const payment of order.prepayments || [])
    entries.push({
      key: `pay-${payment.id}`,
      at: payment.createdAt,
      title: t(`timeline.payment.${payment.kind}`, { amount: money(payment.amountVnd) }),
      tone: payment.kind === 'refund' ? 'warn' : 'done',
    });
  for (const row of order.shipments || [])
    for (const event of row.events || [])
      if (event.applied)
        entries.push({
          key: `event-${event.id}`,
          at: event.createdAt,
          title: t(`shipment.${event.status}`),
          detail: event.reason,
          tone: ['DELIVERY_FAILED', 'EXCEPTION', 'RETURNING'].includes(event.status)
            ? 'warn'
            : event.status === 'CANCELLED'
              ? 'bad'
              : 'done',
        });
  if (order.status === 'CANCELLED' && order.cancelledAt)
    entries.push({ key: 'cancelled', at: order.cancelledAt, title: t('timeline.cancelled'), tone: 'bad' });
  entries.sort((a, b) => b.at.localeCompare(a.at));

  const copy = () =>
    void navigator.clipboard?.writeText(code).then(() => toast.success(t('tracking.copied', { code })));
  const refresh = async () => {
    setBusy(true);
    const updated = await OrderApi.tracking(order.id);
    if (updated) onChange?.(updated);
    setBusy(false);
  };
  const live = shipment && !['CANCELLED', 'DELIVERED', 'RETURNED'].includes(shipment.status);

  return (
    <section className="shipment-tracking" aria-label={t('tracking.title')}>
      {shipment ? (
        <header className="shipment-tracking-head">
          <span className="shipment-carrier-badge" aria-hidden="true">
            {carrier.slice(0, 2).toUpperCase()}
          </span>
          <span className="shipment-tracking-id">
            <strong>{carrier}</strong>
            <span>
              {t('tracking.code')}: <code>{code}</code>
              {shipment.mode !== 'live' && <em>{t('tracking.simulated')}</em>}
              <button type="button" onClick={copy}>
                {t('tracking.copy')}
              </button>
            </span>
          </span>
          {shipment.trackingUrl && shipment.status !== 'CANCELLED' && (
            <a className="mu-button-secondary" href={shipment.trackingUrl} target="_blank" rel="noreferrer">
              {t('tracking.lookUp', { carrier })} ↗
            </a>
          )}
        </header>
      ) : (
        <p className="shipment-tracking-empty">{t('tracking.noWaybill')}</p>
      )}
      {shipment && shipment.status !== 'CANCELLED' && (
        <div className="shipment-tracking-facts">
          <span>
            <small>{t('tracking.collect')}</small>
            <strong>{shipment.codAmountVnd > 0 ? money(shipment.codAmountVnd) : t('tracking.nothingToCollect')}</strong>
          </span>
          {estimate && (
            <span>
              <small>{t('tracking.estimate')}</small>
              <strong>{estimate}</strong>
            </span>
          )}
          <span>
            <small>{t('tracking.status')}</small>
            <strong>{t(`shipment.${shipment.status}`)}</strong>
          </span>
        </div>
      )}
      <ol className="shipment-timeline">
        {entries.map((entry, index) => (
          <li key={entry.key} className={`${index === 0 ? 'is-latest' : ''} is-${entry.tone || 'done'}`}>
            <time dateTime={entry.at}>
              <strong>
                {new Date(entry.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </strong>
              <small>{new Date(entry.at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</small>
            </time>
            <span className="shipment-timeline-dot" aria-hidden="true" />
            <span>
              <strong>{entry.title}</strong>
              {entry.detail && <small>{entry.detail}</small>}
            </span>
          </li>
        ))}
      </ol>
      {onChange && live && (
        <button type="button" className="shipment-tracking-refresh" disabled={busy} onClick={() => void refresh()}>
          {busy ? t('tracking.refreshing') : t('tracking.refresh')}
        </button>
      )}
    </section>
  );
}
