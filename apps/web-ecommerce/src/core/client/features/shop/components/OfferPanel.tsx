'use client';

import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import PriceTag, { useCountdown } from '@/components/PriceTag';
import { formatVND } from '@/shared/server/utils/utils';
import { memberPrice } from '@/shared/pricing';
import { FREESHIP_TIERS, earnedPoints } from '@/shared/promotions';
import type { ProductDetail } from '@/shared/types/product';

// The price block of a product page, the way marketplaces present it: a flash bar with the countdown during a sale, the
// price the customer pays, and the offers that apply to it — the member code, the free-shipping tier the price reaches,
// and the points it earns — with a link to hunt more vouchers.
export default function OfferPanel({ product }: { product: ProductDetail }) {
  const en = useLocale() === 'en';
  const locale = useLocale();
  const shopOwned = !product.partnerId;
  const onSale = product.discountPercent > 0 && product.salePrice < product.price;
  const pays = onSale ? product.salePrice : product.price;
  const countdown = useCountdown(onSale ? product.discountEndsAt : null);
  const freeship = shopOwned ? [...FREESHIP_TIERS].reverse().find((tier) => pays >= tier.minOrderVnd) : undefined;
  const nextFreeship = shopOwned ? FREESHIP_TIERS.find((tier) => pays < tier.minOrderVnd) : undefined;
  const points = shopOwned ? earnedPoints(onSale ? pays : memberPrice(pays), 'MEMBER') : 0;
  return (
    <section className="offer-panel" aria-label={en ? 'Price and offers' : 'Giá và ưu đãi'}>
      {onSale && (
        <div className="offer-flash">
          <strong>⚡ {product.managedSale ? 'FLASH SALE' : en ? 'SALE' : 'GIẢM GIÁ'}</strong>
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
          showMemberPrice={shopOwned && !onSale}
          size="detail"
        />
        {shopOwned && (
          <div className="offer-perks">
            {!onSale && (
              <span className="offer-chip is-member">👑 {en ? 'Member code −10%' : 'Mã thành viên −10%'}</span>
            )}
            {freeship && (
              <span className="offer-chip is-ship">
                🚚 {en ? 'Free shipping up to' : 'Freeship tới'} {formatVND(freeship.maxShippingVnd, locale)}
              </span>
            )}
            {!freeship && nextFreeship && (
              <span className="offer-chip is-ship">
                🚚 {en ? 'Free shipping from' : 'Freeship đơn từ'} {formatVND(nextFreeship.minOrderVnd, locale)}
              </span>
            )}
            {points > 0 && (
              <span className="offer-chip is-points">
                ✦ +{points} {en ? 'points (up to ×2 by tier)' : 'điểm (tới ×2 theo hạng)'}
              </span>
            )}
          </div>
        )}
        <p className="offer-note">
          {shopOwned
            ? en
              ? 'Stack one discount code, one free-shipping code and your points at checkout. '
              : 'Khi thanh toán: dùng cùng lúc 1 mã giảm giá, 1 mã freeship và điểm thưởng. '
            : en
              ? 'Partner listing: shop vouchers do not apply. '
              : 'Sản phẩm của đối tác: không áp dụng mã của shop. '}
          {shopOwned && <Link href="/uu-dai">{en ? 'Hunt more vouchers →' : 'Săn thêm mã →'}</Link>}
        </p>
      </div>
    </section>
  );
}
