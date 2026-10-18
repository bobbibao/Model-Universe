'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import CheckoutApi, { type CheckoutSession } from '@/core/client/api/Checkout';
import CheckoutPaymentModal from '@/core/client/features/cart/components/CheckoutPaymentModal';
import { clock, useCountdown } from '@/components/Payment/PaymentQr';
import { formatVND } from '@/shared/server/utils/utils';

function PendingRow({ session, onOpen }: { session: CheckoutSession; onOpen: () => void }) {
  const t = useTranslations('checkoutPayment'),
    locale = useLocale();
  const seconds = useCountdown(session.expiresAt, session.serverTime);
  return (
    <li className="pending-checkout">
      <span>
        <strong>{t('pendingTitle', { code: `MUC${session.id}` })}</strong>
        <small>
          {t('pendingDetail', {
            amount: formatVND(session.upfrontDueVnd, locale),
            total: formatVND(session.totalVnd, locale),
          })}
          {session.status === 'OPEN' && seconds > 0 ? ` · ${t('timeLeft', { time: clock(seconds) })}` : ''}
        </small>
      </span>
      <button type="button" className="mu-button" onClick={onOpen}>
        {t(session.status === 'OPEN' && seconds > 0 ? 'openQr' : 'renew')}
      </button>
    </li>
  );
}

// Checkouts still waiting for their QR payment: no order exists yet, so they are listed above the orders with their
// countdown. Opening one shows the same QR again (no new payment, no new order).
export default function PendingCheckouts({ onPaid }: { onPaid: () => void }) {
  const t = useTranslations('checkoutPayment');
  const [sessions, setSessions] = useState<CheckoutSession[]>([]);
  const [open, setOpen] = useState<CheckoutSession | null>(null);
  const load = useCallback(() => {
    void CheckoutApi.open()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);
  useEffect(load, [load]);
  if (!sessions.length) return null;
  return (
    <section className="pending-checkouts mb-6" aria-labelledby="pending-checkouts">
      <h2 id="pending-checkouts">{t('pendingHeading')}</h2>
      <p className="mu-note">{t('pendingNote')}</p>
      <ul>
        {sessions.map((session) => (
          <PendingRow key={session.id} session={session} onOpen={() => setOpen(session)} />
        ))}
      </ul>
      {open && (
        <CheckoutPaymentModal
          session={open}
          open
          onSession={(next) => {
            if (next) setSessions((rows) => rows.map((row) => (row.id === next.id ? next : row)));
          }}
          onPaid={() => {
            setOpen(null);
            load();
            onPaid();
          }}
          onClose={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </section>
  );
}
