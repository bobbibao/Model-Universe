'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCountdown } from '@/components/PriceTag';
import { formatVND } from '@/shared/server/utils/utils';
import type { VoucherDrop } from '@/core/client/api/Promotion';

const short = (vnd: number) => (vnd >= 1_000_000 ? `${vnd / 1_000_000}TR` : `${Math.round(vnd / 1000)}K`);

// A voucher as a ticket: the value on a coloured stub, its terms, how many are left, and one action (save, saved, or
// the time it opens).
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
    locale = useLocale();
  const opensIn = useCountdown(new Date(drop.startsAt).getTime() > Date.now() ? drop.startsAt : null);
  const freeship = drop.benefitType === 'freeship';
  const value = freeship
    ? short(drop.maxShippingVnd ?? 0)
    : drop.fixedAmountVnd
      ? short(drop.fixedAmountVnd)
      : `${drop.discountPercent}%`;
  const used = drop.claimLimit ? Math.round(((drop.claimLimit - (drop.remaining ?? 0)) / drop.claimLimit) * 100) : null;
  return (
    <article className={`voucher-ticket${freeship ? ' is-ship' : ''}${drop.claimed ? ' is-claimed' : ''}`}>
      <div className="voucher-stub">
        <small>{freeship ? t('freeship') : t('discount')}</small>
        <strong>{value}</strong>
        {drop.minTier && <em>{drop.minTier}</em>}
      </div>
      <div className="voucher-terms">
        <strong>{drop.title}</strong>
        <span>
          {drop.minOrderVnd > 0 ? t('minOrder', { amount: formatVND(drop.minOrderVnd, locale) }) : t('noMinimum')}
          {!freeship && drop.maxDiscountVnd ? ` · ${t('cap', { amount: formatVND(drop.maxDiscountVnd, locale) })}` : ''}
        </span>
        {used !== null && (
          <span className="voucher-progress" aria-label={t('used', { percent: used })}>
            <i style={{ width: `${used}%` }} />
            <small>{t('used', { percent: used })}</small>
          </span>
        )}
        <small className="voucher-expiry">
          {t('expires', { date: new Date(drop.expiresAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN') })}
        </small>
      </div>
      <div className="voucher-action">
        {drop.claimed ? (
          <span className="voucher-saved">{t('saved')}</span>
        ) : opensIn ? (
          <span className="voucher-soon">
            {t('opensIn')}
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
