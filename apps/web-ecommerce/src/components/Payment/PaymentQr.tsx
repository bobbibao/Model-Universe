'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import { formatVND } from '@/shared/server/utils/utils';

export interface QrPayment {
  amountVnd: number;
  qrCode: string | null;
  checkoutUrl: string | null;
  accountNumber: string | null;
  accountName: string | null;
  description: string | null;
}

const secondsLeft = (expiresAt: string | Date, offsetMs: number) =>
  Math.max(0, Math.floor((new Date(expiresAt).getTime() - (Date.now() + offsetMs)) / 1000));
export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

// The countdown to a payment's expiry, following the server clock (`serverTime` at the moment the data was read).
export function useCountdown(expiresAt: string | Date | null | undefined, serverTime: string | Date | null | undefined) {
  const offset = useRef(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    offset.current = serverTime ? new Date(serverTime).getTime() - Date.now() : 0;
    setSeconds(secondsLeft(expiresAt, offset.current));
    const timer = setInterval(() => setSeconds(secondsLeft(expiresAt, offset.current)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, serverTime]);
  return seconds;
}

// A VietQR payment (payOS): the code to scan with any banking app, the countdown, and the transfer details to copy.
export default function PaymentQr({ payment, seconds }: { payment: QrPayment; seconds: number }) {
  const t = useTranslations('checkoutPayment'),
    locale = useLocale();
  const copy = (value: string | null | undefined, label: string) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value).then(() => toast.success(t('copied', { label })));
  };
  const row = (label: string, value: string | null | undefined, copyable = false) =>
    value ? (
      <div className="checkout-qr-row" key={label}>
        <dt>{label}</dt>
        <dd>
          <span>{value}</span>
          {copyable && (
            <button type="button" onClick={() => copy(value, label)} aria-label={t('copy', { label })}>
              {t('copyShort')}
            </button>
          )}
        </dd>
      </div>
    ) : null;
  return (
    <>
      <div className="checkout-qr-code">
        <div className="checkout-qr-timer" role="timer">
          {t('timeLeft', { time: clock(seconds) })}
        </div>
        {payment.qrCode ? (
          <QRCodeSVG value={payment.qrCode} size={232} marginSize={2} title={t('qrAlt')} />
        ) : (
          <p className="mu-note">{t('qrUnavailable')}</p>
        )}
        <p className="checkout-qr-hint">{t('scanHint')}</p>
        {payment.checkoutUrl && (
          <a className="store-text-link" href={payment.checkoutUrl} target="_blank" rel="noreferrer">
            {t('openPayos')}
          </a>
        )}
      </div>
      <dl className="checkout-qr-transfer">
        {row(t('amount'), formatVND(payment.amountVnd, locale))}
        {row(t('accountNumber'), payment.accountNumber, true)}
        {row(t('accountName'), payment.accountName)}
        {row(t('memo'), payment.description, true)}
      </dl>
    </>
  );
}
