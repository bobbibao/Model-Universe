'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import PromoIcon from '@/components/PromoIcon';
import CouponApi from '@/core/client/api/Coupon';
import { FREESHIP_TIERS } from '@/shared/promotions';
import { formatVND } from '@/shared/server/utils/utils';
import type { CouponPreview } from '@/shared/types/order';

// How far the cart is from the next free-shipping tier, as a bar with the tiers marked, and a one-tap apply once a tier
// is reached. Uses the same public codes the checkout accepts (FREESHIP_TIERS); the server still checks every code.
export default function FreeshipProgress({
  subtotal,
  applied,
  canApply,
  onApply,
}: {
  subtotal: number;
  applied?: string | null;
  canApply: boolean;
  onApply: (coupon: CouponPreview) => void;
}) {
  const locale = useLocale();
  const en = locale === 'en';
  const money = (value: number) => formatVND(value, locale);
  const [busy, setBusy] = useState(false);
  const top = FREESHIP_TIERS[FREESHIP_TIERS.length - 1];
  const reached = [...FREESHIP_TIERS].reverse().find((tier) => subtotal >= tier.minOrderVnd);
  const next = FREESHIP_TIERS.find((tier) => subtotal < tier.minOrderVnd);
  const fill = Math.min(100, (subtotal / top.minOrderVnd) * 100);
  const apply = async () => {
    if (!reached) return;
    setBusy(true);
    const coupon = await CouponApi.validateCoupon(reached.code, subtotal);
    setBusy(false);
    if (coupon) onApply(coupon);
  };
  return (
    <div className={`freeship-progress${reached ? ' is-reached' : ''}`}>
      <p>
        <PromoIcon name="truck" size={18} />
        {next ? (
          <span>
            {reached &&
              (en
                ? `Free shipping up to ${money(reached.maxShippingVnd)} unlocked. `
                : `Đã đủ freeship ${money(reached.maxShippingVnd)}. `)}
            {en ? 'Add ' : 'Mua thêm '}
            <strong>{money(next.minOrderVnd - subtotal)}</strong>
            {en
              ? ` for free shipping up to ${money(next.maxShippingVnd)}`
              : ` để được freeship tới ${money(next.maxShippingVnd)}`}
          </span>
        ) : (
          <span>
            {en ? 'Free shipping up to ' : 'Đơn đủ điều kiện freeship tới '}
            <strong>{money(top.maxShippingVnd)}</strong>
          </span>
        )}
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
      {reached && canApply && applied !== reached.code ? (
        <button type="button" disabled={busy} onClick={() => void apply()}>
          {en ? `Apply ${reached.code}` : `Áp dụng ${reached.code}`}
        </button>
      ) : !reached ? (
        <Link href="/cua-hang">{en ? 'Add more kits' : 'Chọn thêm mô hình'}</Link>
      ) : null}
    </div>
  );
}
