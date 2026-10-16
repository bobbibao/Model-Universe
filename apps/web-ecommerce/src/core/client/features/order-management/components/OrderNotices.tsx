'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import type { Order } from '@/shared/types/order';

// Every notice this order produced: shop alerts (Zalo or the admin list) and the customer's website/email messages,
// with each delivery attempt; failed deliveries can be sent again.
export default function OrderNotices({ order }: { order: Order }) {
  const t = useTranslations('fulfillment.notices'),
    locale = useLocale();
  const [retried, setRetried] = useState<Record<number, string>>({});
  const data = order.notifications;
  if (!data || (!data.alerts.length && !data.notifications.length)) return null;
  const deliveries = (sourceType: string, sourceId: number) =>
    data.deliveries.filter((row) => row.sourceType === sourceType && row.sourceId === sourceId);
  const delivery = (row: (typeof data.deliveries)[number]) => (
    <li key={row.id} className="mu-note">
      {t(`channel.${row.channel}`)} · {t(`status.${retried[row.id] || row.status}`)}
      {row.lastError ? ` · ${row.lastError}` : ''}
      {['failed', 'skipped'].includes(retried[row.id] || row.status) && (
        <button
          className="ml-2 underline"
          onClick={async () => {
            try {
              const result = (await Api.post(`/admin/pricing/deliveries/${row.id}/retry`)).data;
              setRetried((current) => ({ ...current, [row.id]: result.status }));
            } catch {
              /* The toast explains it. */
            }
          }}
        >
          {t('retry')}
        </button>
      )}
    </li>
  );
  return (
    <section className="mu-panel space-y-3 p-5 text-sm">
      <h2 className="text-xl font-bold">{t('title')}</h2>
      {data.alerts.map((alert) => (
        <details key={alert.id}>
          <summary className="cursor-pointer">
            {alert.title} · {new Date(alert.createdAt).toLocaleString(locale)}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{alert.content}</pre>
          <ul>{deliveries('admin_alert', alert.id).map(delivery)}</ul>
        </details>
      ))}
      {data.notifications.map((notice) => (
        <div key={notice.id}>
          <p>
            {t('customer')}: {notice.kind} · {new Date(notice.createdAt).toLocaleString(locale)} · {t(notice.readAt ? 'read' : 'unread')}
          </p>
          <ul>{deliveries('customer_notification', notice.id).map(delivery)}</ul>
        </div>
      ))}
    </section>
  );
}
