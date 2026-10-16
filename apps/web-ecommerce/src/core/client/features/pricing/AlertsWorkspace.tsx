'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';

interface Alert {
  id: number;
  kind: string;
  orderId: number | null;
  title: string;
  content: string;
  status: 'open' | 'resolved';
  createdAt: string;
  deliveries: { id: number; channel: string; status: string; lastError: string | null; attemptCount: number }[];
}

// Shop alerts (new deposit orders, waybills, failed deliveries, appointment changes). Without a permitted Zalo
// integration this list is where staff read them and forward them by hand.
export default function AlertsWorkspace() {
  const t = useTranslations('fulfillment.notices'),
    locale = useLocale();
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [rows, setRows] = useState<Alert[]>([]);
  const load = useCallback(async () => {
    try {
      setRows((await Api.get('/admin/pricing/alerts', { params: { status } })).data);
    } catch {
      /* The toast explains it. */
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (path: string) => {
    try {
      await Api.post(path);
      await load();
    } catch {
      /* The toast explains it. */
    }
  };
  return (
    <section className="space-y-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('alertsTitle')}</h1>
          <p className="mu-note">{t('alertsNote')}</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          {(['open', 'resolved', 'all'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`filter.${value}`)}
            </option>
          ))}
        </select>
      </header>
      {!rows.length && <p className="mu-note">{t('noAlerts')}</p>}
      {rows.map((alert) => (
        <article key={alert.id} className="mu-panel space-y-2 p-5">
          <h2 className="font-bold">{alert.title}</h2>
          <p className="mu-note">{new Date(alert.createdAt).toLocaleString(locale)}</p>
          <pre className="whitespace-pre-wrap font-sans text-sm">{alert.content}</pre>
          <ul className="text-sm">
            {alert.deliveries.map((delivery) => (
              <li key={delivery.id} className="mu-note">
                {t(`channel.${delivery.channel}`)} · {t(`status.${delivery.status}`)} {delivery.lastError ? `· ${delivery.lastError}` : ''}
                {['failed', 'skipped'].includes(delivery.status) && (
                  <button className="ml-2 underline" onClick={() => void act(`/admin/pricing/deliveries/${delivery.id}/retry`)}>
                    {t('retry')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-4">
            {alert.orderId && (
              <Link className="underline" href={`/admin/orders/${alert.orderId}`}>
                {t('openOrder')}
              </Link>
            )}
            {alert.status === 'open' && (
              <button className="underline" onClick={() => void act(`/admin/pricing/alerts/${alert.id}/resolve`)}>
                {t('resolve')}
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
