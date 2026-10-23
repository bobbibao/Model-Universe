'use client';

import { useLocale } from 'next-intl';
import PromoIcon, { type PromoIconName } from '@/components/PromoIcon';
import { formatVND } from '@/shared/server/utils/utils';
import { FREESHIP_TIERS } from '@/shared/promotions';

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
        ? `1 point for every ${formatVND(40_000, locale)} spent, traded for vouchers`
        : `Tích 1 điểm mỗi ${formatVND(40_000, locale)}, đổi điểm lấy voucher`,
    ],
    [
      'crown',
      en ? 'Member tiers take up to 2% more off an eligible voucher' : 'Hạng thành viên giảm thêm tới 2% cùng một mã đủ điều kiện',
    ],
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
