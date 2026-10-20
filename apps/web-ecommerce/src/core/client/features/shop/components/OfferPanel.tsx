'use client';

import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import PriceTag, { compactCount, useCountdown } from '@/components/PriceTag';
import PromoIcon, { type PromoIconName } from '@/components/PromoIcon';
import { formatVND } from '@/shared/server/utils/utils';
import { memberPrice } from '@/shared/pricing';
import { FREESHIP_TIERS, POINT_VALUE_VND, earnedPoints } from '@/shared/promotions';
import type { ProductDetail } from '@/shared/types/product';

// The price block of a product page: a sale bar with its countdown, the price the customer pays, and a short list of
// the offers that apply to this product (member price, free shipping, points), each one line with an icon so the
// customer can scan it, plus a link to collect more vouchers.
export default function OfferPanel({ product }: { product: ProductDetail }) {
  const locale = useLocale();
  const en = locale === 'en';
  const money = (value: number) => formatVND(value, locale);
  const shopOwned = !product.partnerId;
  const onSale = product.discountPercent > 0 && product.salePrice < product.price;
  const pays = onSale ? product.salePrice : product.price;
  const countdown = useCountdown(onSale ? product.discountEndsAt : null);
  const freeship = shopOwned ? [...FREESHIP_TIERS].reverse().find((tier) => pays >= tier.minOrderVnd) : undefined;
  const nextFreeship = shopOwned ? FREESHIP_TIERS.find((tier) => pays < tier.minOrderVnd) : undefined;
  const points = shopOwned ? earnedPoints(onSale ? pays : memberPrice(pays), 'MEMBER') : 0;
  const offers: { icon: PromoIconName; title: string; text: string }[] = shopOwned
    ? [
        ...(!onSale
          ? [
              {
                icon: 'crown' as const,
                title: en
                  ? `Member price ${money(memberPrice(product.price))}`
                  : `Giá thành viên ${money(memberPrice(product.price))}`,
                text: en
                  ? 'With the 10% member code, free every month for signed-in members.'
                  : 'Dùng mã thành viên 10%, nhận miễn phí mỗi tháng khi đăng nhập.',
              },
            ]
          : []),
        freeship
          ? {
              icon: 'truck' as const,
              title: en
                ? `Free shipping up to ${money(freeship.maxShippingVnd)}`
                : `Miễn phí vận chuyển tới ${money(freeship.maxShippingVnd)}`,
              text: en
                ? `With the ${freeship.code} code on orders from ${money(freeship.minOrderVnd)}.`
                : `Dùng mã ${freeship.code} cho đơn từ ${money(freeship.minOrderVnd)}.`,
            }
          : {
              icon: 'truck' as const,
              title: en ? 'Free shipping available' : 'Có mã miễn phí vận chuyển',
              text: en
                ? `For orders from ${money(nextFreeship?.minOrderVnd ?? 0)}.`
                : `Cho đơn từ ${money(nextFreeship?.minOrderVnd ?? 0)}.`,
            },
        ...(points > 0
          ? [
              {
                icon: 'coin' as const,
                title: en ? `Earn ${points} points` : `Tích ${points} điểm`,
                text: en
                  ? `Worth ${money(points * POINT_VALUE_VND)} on a later order; higher tiers earn up to twice as many.`
                  : `Trị giá ${money(points * POINT_VALUE_VND)} cho đơn sau; hạng cao tích tới gấp đôi.`,
              },
            ]
          : []),
      ]
    : [];
  return (
    <section className="offer-panel" aria-label={en ? 'Price and offers' : 'Giá và ưu đãi'}>
      {onSale && (
        <div className="offer-flash">
          <span className="offer-flash-title">
            <PromoIcon name="bolt" size={16} />
            {product.managedSale ? 'Flash Sale' : en ? 'On sale' : 'Đang giảm giá'}
          </span>
          {countdown && (
            <span className="offer-flash-clock">
              {en ? 'Ends in' : 'Kết thúc sau'}
              {countdown.days > 0 && (
                <b>
                  {countdown.days}
                  {en ? 'd' : ' ngày'}
                </b>
              )}
              {countdown.clock.split(':').map((part, index) => (
                <b key={index}>{part}</b>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="offer-body">
        <PriceTag
          price={product.price}
          salePrice={product.salePrice}
          discountPercent={product.discountPercent}
          size="detail"
        />
        {(product.sold > 0 || (product.stock > 0 && product.stock <= 3)) && (
          <p className="offer-proof">
            {product.sold > 0 && (
              <span>
                <PromoIcon name="bag" size={15} />
                {en ? `${compactCount(product.sold, 'en')} sold` : `Đã bán ${compactCount(product.sold, 'vi')}`}
              </span>
            )}
            {product.stock > 0 && product.stock <= 3 && (
              <span className="is-scarce">
                <i aria-hidden="true" />
                {en ? `Only ${product.stock} left in stock` : `Chỉ còn ${product.stock} sản phẩm`}
              </span>
            )}
          </p>
        )}
        {onSale && (
          <p className="offer-saving">
            {en ? 'You save' : 'Tiết kiệm'} <strong>{money(product.price - product.salePrice)}</strong>
          </p>
        )}
      </div>
      {offers.length > 0 ? (
        <ul className="offer-list">
          {offers.map((offer) => (
            <li key={offer.icon}>
              <span className="offer-list-icon">
                <PromoIcon name={offer.icon} size={18} />
              </span>
              <span>
                <strong>{offer.title}</strong>
                <small>{offer.text}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="offer-note">
          {en ? 'Partner listing: shop vouchers do not apply.' : 'Sản phẩm của đối tác: không áp dụng mã của shop.'}
        </p>
      )}
      {shopOwned && (
        <Link href="/uu-dai" className="offer-more">
          <PromoIcon name="ticket" size={16} />
          {en ? 'Collect more vouchers' : 'Lấy thêm mã giảm giá'}
          <PromoIcon name="arrow" size={16} />
        </Link>
      )}
    </section>
  );
}
