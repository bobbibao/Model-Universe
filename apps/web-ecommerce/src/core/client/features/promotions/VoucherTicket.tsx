'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import PromoIcon from '@/components/PromoIcon';
import { useCountdown } from '@/components/PriceTag';
import { formatVND } from '@/shared/server/utils/utils';
import type { VoucherDrop } from '@/core/client/api/Promotion';

const short = (vnd: number) => (vnd >= 1_000_000 ? `${vnd / 1_000_000}TR` : `${Math.round(vnd / 1000)}K`);

// A voucher as a ticket: the value on a tinted stub, the conditions in one line, how much of the batch is gone, and
// one action — save it (timed drops), copy the code (codes anyone can use), or when it opens.
export default function VoucherTicket({
  drop,
  busy,
  onClaim,
}: {
  drop: VoucherDrop;
  busy?: boolean;
  onClaim?: (drop: VoucherDrop) => void;
}) {
  const t = useTranslations('promotions'),
    tiers = useTranslations('tiers'),
    locale = useLocale();
  const [copied, setCopied] = useState(false);
  const opensIn = useCountdown(new Date(drop.startsAt).getTime() > Date.now() ? drop.startsAt : null);
  const freeship = drop.benefitType === 'freeship';
  const value = freeship
    ? short(drop.maxShippingVnd ?? 0)
    : drop.fixedAmountVnd
      ? short(drop.fixedAmountVnd)
      : `${drop.discountPercent}%`;
  const used = drop.claimLimit ? Math.round(((drop.claimLimit - (drop.remaining ?? 0)) / drop.claimLimit) * 100) : null;
  const copy = async () => {
    if (!drop.code) return;
    try {
      await navigator.clipboard.writeText(drop.code);
      setCopied(true);
      toast.success(t('copied', { code: drop.code }));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(drop.code);
    }
  };
  return (
    <article
      className={`voucher-ticket${freeship ? ' is-ship' : ''}${drop.claimed ? ' is-claimed' : ''}${opensIn ? ' is-upcoming' : ''}`}
    >
      <div className="voucher-stub">
        <PromoIcon name={freeship ? 'truck' : 'percent'} size={18} />
        <strong>{value}</strong>
        <small>{freeship ? t('freeship') : t('discount')}</small>
      </div>
      <div className="voucher-body">
        <p className="voucher-title">
          {drop.title}
          {drop.minTier && <span className="voucher-tier">{tiers(drop.minTier)}+</span>}
        </p>
        <p className="voucher-terms">
          {drop.minOrderVnd > 0 ? t('minOrder', { amount: formatVND(drop.minOrderVnd, locale) }) : t('noMinimum')}
          {!freeship && drop.maxDiscountVnd ? ` · ${t('cap', { amount: formatVND(drop.maxDiscountVnd, locale) })}` : ''}
        </p>
        {used !== null && !opensIn && (
          <span className="voucher-meter" aria-label={t('used', { percent: used })}>
            <i style={{ width: `${used}%` }} />
          </span>
        )}
        <p className="voucher-foot">
          {used !== null && !opensIn && (
            <span className={used >= 70 ? 'is-hot' : ''}>{t('used', { percent: used })}</span>
          )}
          <span>
            {t('expires', {
              date: new Date(drop.expiresAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN', {
                day: '2-digit',
                month: '2-digit',
                // Long-lived codes show the year so "20/10" is not read as today.
                ...(new Date(drop.expiresAt).getFullYear() !== new Date().getFullYear()
                  ? { year: 'numeric' as const }
                  : {}),
              }),
            })}
          </span>
        </p>
      </div>
      <div className="voucher-action">
        {drop.kind === 'standing' || drop.claimed ? (
          <button type="button" className="is-ghost" onClick={() => void copy()} title={drop.code ?? ''}>
            <PromoIcon name={copied ? 'check' : drop.claimed ? 'check' : 'ticket'} size={15} />
            {copied ? t('copiedShort') : drop.claimed ? t('saved') : t('copy')}
          </button>
        ) : opensIn ? (
          <span className="voucher-soon">
            <small>{t('opensIn')}</small>
            <b>{opensIn.clock}</b>
          </span>
        ) : drop.remaining === 0 ? (
          <span className="voucher-soldout">{t('soldOut')}</span>
        ) : (
          <button type="button" disabled={busy} onClick={() => onClaim?.(drop)}>
            {t('save')}
          </button>
        )}
      </div>
    </article>
  );
}
