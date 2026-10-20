'use client';

import { useLocale } from 'next-intl';
import PromoIcon, { type PromoIconName } from '@/components/PromoIcon';
import { formatVND } from '@/shared/server/utils/utils';
import { FREESHIP_TIERS, POINT_VALUE_VND } from '@/shared/promotions';

// A slim strip that scrolls the shop's standing promises across the top of the home page (pauses on hover). Every line
// is a real, current policy: the free-shipping tiers, voucher drop times, points, real photos, visiting the shop.
export default function AnnouncementTicker() {
  const locale = useLocale();
  const en = locale === 'en';
  const top = FREESHIP_TIERS[FREESHIP_TIERS.length - 1];
  const items: [PromoIconName, string][] = [
    [
      'truck',
      en
        ? `Free shipping up to ${formatVND(top.maxShippingVnd, locale)} on orders from ${formatVND(top.minOrderVnd, locale)}`
        : `Freeship tới ${formatVND(top.maxShippingVnd, locale)} cho đơn từ ${formatVND(top.minOrderVnd, locale)}`,
    ],
    ['ticket', en ? 'New vouchers at 00:00 · 12:00 · 20:00' : 'Mã mới mở lúc 00:00 · 12:00 · 20:00'],
    [
      'coin',
      en
        ? `Earn points on every order, 1 point = ${formatVND(POINT_VALUE_VND, locale)}`
        : `Tích điểm mọi đơn hàng, 1 điểm = ${formatVND(POINT_VALUE_VND, locale)}`,
    ],
    ['crown', en ? 'Higher tiers earn up to twice the points' : 'Hạng càng cao, tích điểm tới gấp đôi'],
    ['package', en ? 'Real photos of the exact model you receive' : 'Ảnh chụp thực tế đúng mô hình bạn nhận'],
    ['user', en ? 'Visit the showroom or call 0373 725 104' : 'Xem hàng tại shop · Hotline 0373 725 104'],
  ];
  const row = items.map(([icon, text]) => (
    <span key={text} className="ticker-item">
      <PromoIcon name={icon} size={15} />
      {text}
    </span>
  ));
  return (
    <div className="ticker" aria-label={en ? 'Shop promises' : 'Cam kết của shop'}>
      <div className="ticker-track">
        <div className="ticker-group">{row}</div>
        <div className="ticker-group" aria-hidden="true">
          {row}
        </div>
      </div>
    </div>
  );
}
