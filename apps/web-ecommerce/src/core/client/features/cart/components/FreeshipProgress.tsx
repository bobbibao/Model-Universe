'use client';

import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import PromoIcon from '@/components/PromoIcon';
import { FREESHIP_TIERS } from '@/shared/promotions';
import { formatVND } from '@/shared/server/utils/utils';

// How far the cart is from the next free-shipping tier, as one compact strip: a line of text and, while a tier is still
// ahead, a thin bar with the tiers marked. The voucher section applies the best free-shipping code by itself, so there
// is no separate apply button here.
export default function FreeshipProgress({
  subtotal,
  appliedVnd,
  loggedIn,
  hasFee,
}: {
  subtotal: number;
  appliedVnd: number;
  loggedIn: boolean;
  hasFee: boolean;
}) {
  const locale = useLocale();
  const en = locale === 'en';
  const money = (value: number) => formatVND(value, locale);
  const top = FREESHIP_TIERS[FREESHIP_TIERS.length - 1];
  const reached = [...FREESHIP_TIERS].reverse().find((tier) => subtotal >= tier.minOrderVnd);
  const next = FREESHIP_TIERS.find((tier) => subtotal < tier.minOrderVnd);
  const fill = Math.min(100, (subtotal / top.minOrderVnd) * 100);
  const text =
    appliedVnd > 0 ? (
      en ? (
        <>
          Free shipping applied: <strong>−{money(appliedVnd)}</strong>
        </>
      ) : (
        <>
          Đã giảm phí ship <strong>{money(appliedVnd)}</strong>
        </>
      )
    ) : next ? (
      en ? (
        <>
          Add <strong>{money(next.minOrderVnd - subtotal)}</strong> for free shipping up to {money(next.maxShippingVnd)}
        </>
      ) : (
        <>
          Mua thêm <strong>{money(next.minOrderVnd - subtotal)}</strong> để freeship tới {money(next.maxShippingVnd)}
        </>
      )
    ) : en ? (
      <>
        Free shipping up to <strong>{money(top.maxShippingVnd)}</strong>
        {loggedIn && !hasFee ? ' · applied once the fee is known' : ''}
      </>
    ) : (
      <>
        Đủ freeship tới <strong>{money(top.maxShippingVnd)}</strong>
        {loggedIn && !hasFee ? ' · tự áp khi có phí ship' : ''}
      </>
    );
  return (
    <div className={`freeship-progress${appliedVnd > 0 || !next ? ' is-reached' : ''}`}>
      <p>
        <PromoIcon name={appliedVnd > 0 || !next ? 'check' : 'truck'} size={15} />
        <span>{text}</span>
        {reached && !loggedIn ? (
          <Link href="/auth/signin?redirect=/cart">{en ? 'Sign in' : 'Đăng nhập'}</Link>
        ) : (
          next && <Link href="/cua-hang">{en ? 'Add kits' : 'Mua thêm'}</Link>
        )}
      </p>
      {next && (
        <div className="freeship-bar" aria-hidden="true">
          <i style={{ width: `${fill}%` }} />
          {FREESHIP_TIERS.map((tier) => (
            <b
              key={tier.code}
              className={subtotal >= tier.minOrderVnd ? 'is-hit' : ''}
              style={{ left: `${(tier.minOrderVnd / top.minOrderVnd) * 100}%` }}
              title={`${money(tier.minOrderVnd)} → ${money(tier.maxShippingVnd)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
