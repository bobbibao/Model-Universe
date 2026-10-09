'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { CustomerNotification, RestockPreference } from '@/shared/types/customer-tools';

export default function CustomerInbox() {
  const t = useTranslations('customerTools'), common = useTranslations('common'), locale = useLocale(), { user } = useCurrentUser();
  const [rows, setRows] = useState<CustomerNotification[]>([]), [subscriptions, setSubscriptions] = useState<RestockPreference[]>([]);
  const [offset, setOffset] = useState(0), [count, setCount] = useState(0), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [notifications, alerts] = await Promise.all([Api.get('/notifications', { params: { offset } }), Api.get('/notifications/restocks')]);
      setRows(notifications.data.rows); setCount(notifications.data.count); setSubscriptions(alerts.data); setFailed(false); setLoaded(true);
    } catch { setFailed(true); }
  }, [user, offset]);
  useEffect(() => { setLoaded(false); setRows([]); setSubscriptions([]); void load(); }, [load]);
  if (!user) return <section className="mu-wrap mu-section"><h1 className="mu-heading">{t('inbox')}</h1><Link className="mu-button mt-6" href="/auth/signin?redirect=%2Faccount%2Fnotifications">{common('signIn')}</Link></section>;
  return <section className="mu-wrap mu-section"><p className="mu-eyebrow">MODEL UNIVERSE / ACCOUNT</p><h1 className="mu-heading">{t('inbox')}</h1><p className="mu-note mt-4">{t('inboxNote')}</p>
    {failed && <button className="mu-button mt-4" onClick={() => void load()}>{common('retry')}</button>}
    {!loaded && !failed && <p className="mu-note mt-4" role="status">{common('loading')}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]"><div className="space-y-4">
      {loaded && rows.length === 0 && <p className="mu-note">{t('noNotifications')}</p>}
      {rows.map(row => {
        const known = ['restock', 'reservation_deadline', 'pawn_due', 'pawn_overdue'].includes(row.kind);
        const href = row.kind === 'restock' ? `/shop/product/${row.entityId}` : row.kind === 'reservation_deadline' ? '/reservations' : row.kind.startsWith('pawn_') ? '/services/pawn' : null;
        return <article className="mu-panel space-y-3 p-5" key={row.id}>
          <h2 className="text-xl font-bold tracking-tight">{known ? t(`kinds.${row.kind}`) : t('notification')}</h2>
          <p className="mu-note">{new Date(row.createdAt).toLocaleString(locale)}</p>
          {row.kind === 'restock' && <><p className="break-words">{String(row.details.productName || '')}</p><p className="mu-note">{t('stockObserved', { count: Number(row.details.observedStock || 0) })}</p></>}
          {typeof row.details.dueAt === 'string' && <p className="mu-note">{new Date(row.details.dueAt).toLocaleString(locale)}</p>}
          {row.kind === 'reservation_deadline' && typeof row.details.expiresAt === 'string' && <p className="mu-note">{new Date(row.details.expiresAt).toLocaleString(locale)}</p>}
          <div className="flex flex-wrap gap-4">{href && <Link className="underline" href={href}>{t('view')}</Link>}{!row.readAt ? <button className="underline" disabled={busy} onClick={async () => { setBusy(true); try { await Api.post(`/notifications/${row.id}/read`); await load(); } catch { /* Keep unread state after a failed write. */ } finally { setBusy(false); } }}>{t('markRead')}</button> : <span className="mu-note">{t('read')}</span>}</div>
        </article>;
      })}
      {count > 30 && <div className="flex gap-3"><button className="mu-button-secondary" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>{common('previous')}</button><button className="mu-button-secondary" disabled={busy || offset + 30 >= count} onClick={() => setOffset(offset + 30)}>{common('next')}</button></div>}
    </div><aside className="mu-panel h-fit space-y-4 p-5"><h2 className="text-2xl font-bold tracking-tight">{t('restockPreferences')}</h2>
      {loaded && subscriptions.length === 0 && <p className="mu-note">{t('noAlerts')}</p>}
      {subscriptions.map(row => <div className="space-y-2 border-t border-store-muted/30 pt-4" key={row.id}><p className="break-words">{row.product?.name || t('unavailableItem')}</p><p className="mu-note">{row.active ? t('alertActive') : row.notifiedAt ? t('alertSent') : t('alertOff')}</p>
        {row.active && <button className="underline" disabled={busy} onClick={async () => { setBusy(true); try { await Api.post(`/notifications/restocks/${row.productId}`, { active: false }); await load(); } catch { /* Change only after confirmation. */ } finally { setBusy(false); } }}>{t('stopAlert')}</button>}</div>)}
    </aside></div>
  </section>;
}
