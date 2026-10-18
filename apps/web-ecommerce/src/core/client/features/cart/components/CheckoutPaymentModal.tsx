'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Modal from '@/components/Modal/Modal';
import PaymentQr, { useCountdown } from '@/components/Payment/PaymentQr';
import CheckoutApi, { type CheckoutSession } from '@/core/client/api/Checkout';
import { formatVND } from '@/shared/server/utils/utils';

const POLL_MS = 3_000;

// The QR payment of an online checkout: the VietQR to scan with any banking app, the transfer details, a countdown
// until the QR expires, and a switch between the deposit and full payment (a new QR). The dialog polls the session;
// once payOS confirms the money the order exists and `onPaid` receives it. Closing the dialog keeps the session open.
export default function CheckoutPaymentModal({
  session: initial,
  open,
  onSession,
  onPaid,
  onClose,
}: {
  session: CheckoutSession;
  open: boolean;
  onSession: (session: CheckoutSession | null) => void;
  onPaid: (orderId: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('checkoutPayment'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [session, setSession] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const seconds = useCountdown(session.status === 'OPEN' ? session.expiresAt : null, session.serverTime);
  const paidOnce = useRef(false);

  const update = (next: CheckoutSession) => {
    setSession(next);
    onSession(next);
  };
  useEffect(() => setSession(initial), [initial]);

  // Poll the payment while the QR is open (also while the dialog is closed: the order may arrive meanwhile).
  useEffect(() => {
    if (session.status !== 'OPEN' && session.status !== 'PAID') return;
    let active = true;
    const timer = setInterval(() => {
      void CheckoutApi.status(session.id)
        .then((next) => active && update(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.status]);

  useEffect(() => {
    if (session.status === 'COMPLETED' && session.orderId && !paidOnce.current) {
      paidOnce.current = true;
      onPaid(session.orderId);
    }
  }, [session.status, session.orderId, onPaid]);

  const run = async (work: () => Promise<CheckoutSession>) => {
    setBusy(true);
    try {
      update(await work());
    } catch {
      /* The API layer shows the error. */
    } finally {
      setBusy(false);
    }
  };

  const total = session.totalVnd;
  // Only two ways to pay (owner decision 2026-10-18): the deposit or the full amount.
  const plans = [
    { key: 'deposit', label: t('deposit'), plan: 'deposit' as const, amount: session.depositAmountVnd },
    { key: 'full', label: t('full'), plan: 'full' as const, amount: total },
  ].filter((option, index, all) => all.findIndex((other) => other.amount === option.amount) === index);
  const choose = (option: (typeof plans)[number]) =>
    run(() =>
      CheckoutApi.changePlan(session.id, option.plan, option.plan === 'deposit' ? option.amount : undefined, locale),
    );

  const payment = session.payment;
  const expired =
    session.status === 'EXPIRED' || (session.status === 'OPEN' && ((!!payment && seconds === 0) || !!session.underpaid));
  const row = (label: string, value: string) => (
    <div className="checkout-qr-row" key={label}>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
      </dd>
    </div>
  );

  return (
    <Modal open={open} title={t('title')} onClose={onClose} size="lg">
      <div className="checkout-qr" aria-live="polite">
        {session.status === 'OPEN' && !expired && payment && (
          <>
            <PaymentQr payment={payment} seconds={seconds} />
            <div className="checkout-qr-details">
              <p className="mu-note">{t('memoNote')}</p>
              <fieldset className="checkout-qr-plans" disabled={busy}>
                <legend>{t('changeMethod')}</legend>
                <div role="group">
                  {plans.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={option.amount === session.upfrontDueVnd}
                      onClick={() => option.amount !== session.upfrontDueVnd && void choose(option)}
                    >
                      {option.label}
                      <small>{money(option.amount)}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <dl className="checkout-qr-summary">
                {row(t('orderTotal'), money(total))}
                {session.shipping &&
                  row(
                    t('shipping'),
                    `${money(session.shipping.feeVnd)}${session.shipping.carrierName ? ` · ${session.shipping.carrierName}` : ''}`,
                  )}
                {row(t('payLater'), session.balanceVnd > 0 ? money(session.balanceVnd) : t('nothingLater'))}
              </dl>
              <p className="checkout-qr-waiting">
                <span className="checkout-qr-dot" aria-hidden="true" />
                {t('waiting')}
              </p>
            </div>
          </>
        )}
        {session.status === 'PAID' && <p className="checkout-qr-state">{t('creatingOrder')}</p>}
        {session.status === 'COMPLETED' && <p className="checkout-qr-state">{t('paid')}</p>}
        {expired && (
          <div className="checkout-qr-state">
            <p>{t(session.underpaid ? 'underpaid' : 'expired')}</p>
            <button
              type="button"
              className="mu-button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  CheckoutApi.changePlan(
                    session.id,
                    session.paymentPlan,
                    session.paymentPlan === 'deposit' ? session.upfrontDueVnd : undefined,
                    locale,
                  ),
                )
              }
            >
              {t('renew')}
            </button>
          </div>
        )}
        {session.status === 'CANCELLED' && <p className="checkout-qr-state">{t('cancelled')}</p>}
        {session.status === 'FAILED' && <p className="checkout-qr-state text-danger">{t('failed')}</p>}
      </div>
      {session.status === 'OPEN' && !expired && (
        <div className="checkout-qr-footer">
          {confirmCancel ? (
            <>
              <span>{t('confirmCancel')}</span>
              <button type="button" className="store-text-link" onClick={() => setConfirmCancel(false)}>
                {t('keepPaying')}
              </button>
              <button
                type="button"
                className="text-danger underline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const next = await CheckoutApi.cancel(session.id);
                    CheckoutApi.forget();
                    onClose();
                    return next;
                  })
                }
              >
                {t('cancelPayment')}
              </button>
            </>
          ) : (
            <button type="button" className="store-text-link" onClick={() => setConfirmCancel(true)}>
              {t('cancelPayment')}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
