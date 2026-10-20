'use client';

import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import PromoIcon from '@/components/PromoIcon';
import { FREESHIP_TIERS } from '@/shared/promotions';
import { formatVND } from '@/shared/server/utils/utils';

// How far the cart is from the next free-shipping tier, as a bar with the tiers marked, and what is actually happening:
// applied (with the amount), waiting for an address (no fee yet), or waiting for sign-in. The voucher section applies
// the best free-shipping code by itself, so there is no separate apply button here.
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
  const status = !reached
    ? null
    : appliedVnd > 0
      ? en
        ? `Free shipping applied: −${money(appliedVnd)}.`
        : `Đã áp dụng freeship: −${money(appliedVnd)}.`
      : loggedIn && !hasFee
        ? en
          ? 'Applied automatically once the shipping fee is known.'
          : 'Tự áp dụng khi có phí vận chuyển (chọn địa chỉ giao hàng).'
        : null;
  return (
    <div className={`freeship-progress${appliedVnd > 0 ? ' is-reached' : ''}`}>
      <p>
        <PromoIcon name="truck" size={18} />
        <span>
          {next ? (
            <>
              {reached &&
                (en
                  ? `Free shipping up to ${money(reached.maxShippingVnd)} unlocked. `
                  : `Đã đủ freeship ${money(reached.maxShippingVnd)}. `)}
              {en ? 'Add ' : 'Mua thêm '}
              <strong>{money(next.minOrderVnd - subtotal)}</strong>
              {en
                ? ` for up to ${money(next.maxShippingVnd)}.`
                : ` để được freeship tới ${money(next.maxShippingVnd)}.`}
            </>
          ) : (
            <>
              {en ? 'Your order gets free shipping up to ' : 'Đơn đủ điều kiện freeship tới '}
              <strong>{money(top.maxShippingVnd)}</strong>.
            </>
          )}
          {status && <small>{status}</small>}
        </span>
      </p>
      <div className="freeship-bar">
        <i style={{ width: `${fill}%` }} />
        {FREESHIP_TIERS.map((tier) => (
          <b
            key={tier.code}
            className={subtotal >= tier.minOrderVnd ? 'is-hit' : ''}
            style={{ left: `${(tier.minOrderVnd / top.minOrderVnd) * 100}%` }}
          />
        ))}
      </div>
      {reached && !loggedIn && (
        <Link href="/auth/signin?redirect=/cart">{en ? 'Sign in to use it' : 'Đăng nhập để dùng freeship'}</Link>
      )}
      {!reached && <Link href="/cua-hang">{en ? 'Add more kits' : 'Chọn thêm mô hình'}</Link>}
    </div>
  );
}
