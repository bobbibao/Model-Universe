'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { memberPrice } from '@/shared/pricing';
import { formatVND } from '@/shared/server/utils/utils';

interface PriceTagProps {
  price: number;
  salePrice?: number;
  discountPercent?: number;
  className?: string;
  showMemberPrice?: boolean;
  showDiscountBadge?: boolean;
  size?: 'card' | 'detail';
}

// "1.880.000 ₫" → { amount: "1.880.000", currency: "₫" }, so the currency can be set smaller like marketplace prices.
const split = (value: string) => {
  const match = value.match(/^(.*?)\s*(₫|VND|đ)$/u);
  return match ? { amount: match[1], currency: '₫' } : { amount: value, currency: '' };
};

// Counts down to `endsAt` every second (hh:mm:ss, with days when longer); null once it has passed.
export function useCountdown(endsAt?: string | Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return null;
  const days = Math.floor(left / 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const clock = `${pad(Math.floor((left % 86_400_000) / 3_600_000))}:${pad(Math.floor((left % 3_600_000) / 60_000))}:${pad(Math.floor((left % 60_000) / 1000))}`;
  return { days, clock, left };
}

// The price the customer pays first and largest (red only during a sale, with the struck list price and the saving),
// then, for shop products off sale, the member price spelled out in full: what a member pays with the free monthly 10%
// member code.
const PriceTag = ({
  price,
  salePrice,
  discountPercent = 0,
  className = '',
  showMemberPrice = false,
  showDiscountBadge = true,
  size = 'card',
}: PriceTagProps) => {
  const locale = useLocale();
  const en = locale === 'en';
  const discounted = discountPercent > 0 && salePrice !== undefined && salePrice < price;
  const pay = split(formatVND(discounted ? (salePrice as number) : price, locale));
  const member = split(formatVND(memberPrice(price), locale));
  return (
    <span className={`price-tag is-${size}${discounted ? ' is-sale' : ''} ${className}`}>
      <span className="price-tag-row">
        <span className="price-tag-now">
          {pay.amount}
          <small>{pay.currency}</small>
        </span>
        {discounted && showDiscountBadge && <span className="price-tag-off">-{Math.round(discountPercent)}%</span>}
      </span>
      {discounted && <s className="price-tag-was">{formatVND(price, locale)}</s>}
      {showMemberPrice && (
        <span
          className="price-tag-member"
          title={en ? 'With the free monthly 10% member code' : 'Khi dùng mã thành viên 10% (nhận miễn phí mỗi tháng)'}
        >
          {en ? 'Member price' : 'Giá thành viên'}
          <strong>
            {member.amount}
            <small>{member.currency}</small>
          </strong>
        </span>
      )}
    </span>
  );
};

export default PriceTag;
