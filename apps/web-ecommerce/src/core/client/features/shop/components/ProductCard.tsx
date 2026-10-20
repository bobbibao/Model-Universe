'use client';

import '@/core/client/features/sales/sales.css';
import Link from '@/i18n/navigation';
import ProductStage from '@/components/ProductStage';
import PriceTag, { useCountdown } from '@/components/PriceTag';
import type { ProductSummary } from '@/shared/types/product';
import { productPath } from '@/shared/slug';
import { FREESHIP_TIERS } from '@/shared/promotions';
import RatingStars from './RatingStars';
import { useLocale, useTranslations } from 'next-intl';

// A product tile as marketplaces lay it out: the photo carries the offer (sale percentage or the member price, and the
// free-shipping tier the price reaches), then the name, the price the customer pays, and a countdown when a sale ends
// within three days.
const ProductCard = ({ product }: { product: ProductSummary }) => {
  const t = useTranslations('catalog');
  const en = useLocale() === 'en';
  const href = productPath(product);
  const shopOwned = !product.partnerId;
  const onSale = product.discountPercent > 0 && product.salePrice < product.price;
  const pays = onSale ? product.salePrice : product.price;
  const freeship = shopOwned ? [...FREESHIP_TIERS].reverse().find((tier) => pays >= tier.minOrderVnd) : undefined;
  const countdown = useCountdown(onSale ? product.discountEndsAt : null);
  const soon = countdown && countdown.left < 3 * 86_400_000;
  return (
    <div className="mu-product product-tile group flex flex-col">
      <Link href={href} className="mu-product-photo overflow-hidden">
        <ProductStage
          src={product.imageUrl}
          alt={product.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
          className="studio-card-stage"
        />
        {product.stock > 0 && onSale && (
          <span className={`tile-ribbon${product.managedSale ? ' is-event' : ''}`}>
            {product.managedSale && <b>{en ? 'SALE' : 'SALE'}</b>}-{product.discountPercent}%
          </span>
        )}
        {product.stock > 0 && !onSale && shopOwned && (
          <span
            className="tile-ribbon is-member"
            title={en ? 'With the monthly 10% member code' : 'Khi dùng mã thành viên 10% hằng tháng'}
          >
            {en ? 'MEMBER' : 'GIÁ TV'} -10%
          </span>
        )}
        {product.stock > 0 && freeship && (
          <span className="tile-freeship">
            {en ? 'Free shipping' : 'Freeship'} {Math.round(freeship.maxShippingVnd / 1000)}K
          </span>
        )}
        {product.stock <= 0 && <span className="tile-soldout">{t('soldOut')}</span>}
        {product.salesChannel === 'outlet' && <span className="tile-outlet">Outlet</span>}
      </Link>
      <div className="product-tile-body">
        <div className="product-tile-tags">
          {product.grade && <span>{product.grade}</span>}
          {product.scale && <span>{product.scale}</span>}
          <span className={product.condition === 'preowned' ? 'is-used' : ''}>
            {t(product.condition === 'preowned' ? 'preowned' : 'new')}
          </span>
        </div>
        <Link href={href} className="product-tile-name">
          {product.name}
        </Link>
        <p className="product-tile-brand">
          {product.brandName}
          {product.reviewCount > 0 && (
            <span>
              <RatingStars rating={product.rating} size="sm" />({product.reviewCount})
            </span>
          )}
        </p>
        <div className="mt-auto">
          <PriceTag
            price={product.price}
            salePrice={product.salePrice}
            discountPercent={product.discountPercent}
            showDiscountBadge={false}
            showMemberPrice={shopOwned && !onSale}
          />
          {soon && (
            <p className="tile-countdown">
              <span aria-hidden="true">⏱</span> {en ? 'Ends in' : 'Kết thúc sau'}{' '}
              <strong>
                {countdown.days > 0 ? `${countdown.days}${en ? 'd' : ' ngày'} ` : ''}
                {countdown.clock}
              </strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
