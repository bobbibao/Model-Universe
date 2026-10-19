'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { formatVND } from '@/shared/server/utils/utils';
import type { CustomerNotification, RestockPreference } from '@/shared/types/customer-tools';

const KNOWN_KINDS = [
  'restock',
  'order_cancel_rejected',
  'order_cancelled',
  'reservation_deadline',
  'pawn_due',
  'pawn_overdue',
  'order_meeting_deposit',
  'order_cod_deposit',
  'order_meeting_confirmed',
  'order_handover_completed',
  'order_shipment_created',
  'order_shipment_picked_up',
  'order_shipment_in_transit',
  'order_shipment_out_for_delivery',
  'order_shipment_delivered',
  'order_shipment_failed',
  'order_shipment_returning',
  'order_shipment_returned',
  'buyback_need_evidence',
  'buyback_preliminary_quote',
  'buyback_received',
  'buyback_final_quote',
  'buyback_final_quote_adjusted',
  'voucher_expiring',
];

export default function CustomerInbox({ embedded = false }: { embedded?: boolean } = {}) {
  const Heading = embedded ? 'h2' : 'h1';
  const t = useTranslations('customerTools'),
    common = useTranslations('common'),
    locale = useLocale(),
    { user } = useCurrentUser();
  const [rows, setRows] = useState<CustomerNotification[]>([]),
    [subscriptions, setSubscriptions] = useState<RestockPreference[]>([]);
  const [offset, setOffset] = useState(0),
    [count, setCount] = useState(0),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [notifications, alerts] = await Promise.all([
        Api.get('/notifications', { params: { offset } }),
        Api.get('/notifications/restocks'),
      ]);
      setRows(notifications.data.rows);
      setCount(notifications.data.count);
      setSubscriptions(alerts.data);
      setFailed(false);
      setLoaded(true);
    } catch {
      setFailed(true);
    }
  }, [user, offset]);
  useEffect(() => {
    setLoaded(false);
    setRows([]);
    setSubscriptions([]);
    void load();
  }, [load]);
  if (!user)
    return (
      <section className="mu-wrap mu-section">
        <Heading className="mu-heading">{t('inbox')}</Heading>
        <Link className="mu-button mt-6" href="/auth/signin?redirect=%2Faccount%2Fnotifications">
          {common('signIn')}
        </Link>
      </section>
    );
  return (
    <section className="mu-wrap mu-section">
      <p className="mu-eyebrow">MODEL UNIVERSE / ACCOUNT</p>
      <Heading className="mu-heading">{t('inbox')}</Heading>
      <p className="mu-note mt-4">{t('inboxNote')}</p>
      {failed && (
        <button className="mu-button mt-4" onClick={() => void load()}>
          {common('retry')}
        </button>
      )}
      {!loaded && !failed && (
        <p className="mu-note mt-4" role="status">
          {common('loading')}
        </p>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {loaded && rows.length === 0 && <p className="mu-note">{t('noNotifications')}</p>}
          {rows.map((row) => {
            const known = KNOWN_KINDS.includes(row.kind);
            const href =
              row.kind === 'restock'
                ? `/shop/product/${row.entityId}`
                : row.kind === 'reservation_deadline'
                  ? '/reservations'
                  : row.kind.startsWith('pawn_')
                    ? '/services/pawn'
                    : row.kind.startsWith('order_')
                      ? '/order-history'
                      : row.kind.startsWith('buyback_')
                        ? '/services/sell'
                        : row.kind === 'voucher_expiring'
                          ? '/cart'
                          : null;
            const facts = [row.details.orderCode, row.details.code, row.details.trackingNumber].filter(
              (value): value is string => typeof value === 'string',
            );
            const amounts = (['amountVnd', 'confirmedPaidVnd', 'remainingVnd', 'codAmountVnd'] as const).filter(
              (key) => typeof row.details[key] === 'number',
            );
            return (
              <article className="mu-panel space-y-3 p-5" key={row.id}>
                <h2 className="text-xl font-bold tracking-tight">
                  {known ? t(`kinds.${row.kind}`) : t('notification')}
                </h2>
                <p className="mu-note">{new Date(row.createdAt).toLocaleString(locale)}</p>
                {row.kind === 'restock' && (
                  <>
                    <p className="break-words">{String(row.details.productName || '')}</p>
                    <p className="mu-note">{t('stockObserved', { count: Number(row.details.observedStock || 0) })}</p>
                  </>
                )}
                {facts.length > 0 && <p className="break-words font-semibold">{facts.join(' · ')}</p>}
                {amounts.map((key) => (
                  <p key={key} className="mu-note">
                    {t(`amounts.${key}`, { amount: formatVND(Number(row.details[key]), locale) })}
                  </p>
                ))}
                {['reason', 'request', 'address', 'description'].map((key) =>
                  typeof row.details[key] === 'string' && row.details[key] ? (
                    <p key={key} className="mu-note whitespace-pre-line">
                      {String(row.details[key])}
                    </p>
                  ) : null,
                )}
                {typeof row.details.at === 'string' && (
                  <p className="mu-note">{new Date(row.details.at).toLocaleString(locale)}</p>
                )}
                {typeof row.details.expiresAt === 'string' && row.kind === 'voucher_expiring' && (
                  <p className="mu-note">{new Date(row.details.expiresAt).toLocaleString(locale)}</p>
                )}
                {typeof row.details.dueAt === 'string' && (
                  <p className="mu-note">{new Date(row.details.dueAt).toLocaleString(locale)}</p>
                )}
                {row.kind === 'reservation_deadline' && typeof row.details.expiresAt === 'string' && (
                  <p className="mu-note">{new Date(row.details.expiresAt).toLocaleString(locale)}</p>
                )}
                <div className="flex flex-wrap gap-4">
                  {href && (
                    <Link className="underline" href={href}>
                      {t('view')}
                    </Link>
                  )}
                  {!row.readAt ? (
                    <button
                      className="underline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await Api.post(`/notifications/${row.id}/read`);
                          await load();
                        } catch {
                          /* Keep unread state after a failed write. */
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t('markRead')}
                    </button>
                  ) : (
                    <span className="mu-note">{t('read')}</span>
                  )}
                </div>
              </article>
            );
          })}
          {count > 30 && (
            <div className="flex gap-3">
              <button
                className="mu-button-secondary"
                disabled={busy || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 30))}
              >
                {common('previous')}
              </button>
              <button
                className="mu-button-secondary"
                disabled={busy || offset + 30 >= count}
                onClick={() => setOffset(offset + 30)}
              >
                {common('next')}
              </button>
            </div>
          )}
        </div>
        <aside className="mu-panel h-fit space-y-4 p-5">
          <h2 className="text-2xl font-bold tracking-tight">{t('restockPreferences')}</h2>
          {loaded && subscriptions.length === 0 && <p className="mu-note">{t('noAlerts')}</p>}
          {subscriptions.map((row) => (
            <div className="space-y-2 border-t border-store-muted/30 pt-4" key={row.id}>
              <p className="break-words">{row.product?.name || t('unavailableItem')}</p>
              <p className="mu-note">
                {row.active ? t('alertActive') : row.notifiedAt ? t('alertSent') : t('alertOff')}
              </p>
              {row.active && (
                <button
                  className="underline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await Api.post(`/notifications/restocks/${row.productId}`, { active: false });
                      await load();
                    } catch {
                      /* Change only after confirmation. */
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('stopAlert')}
                </button>
              )}
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
