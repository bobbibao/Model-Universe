'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import Carousel from '@/components/Carousel';
import PromoIcon, { type PromoIconName } from '@/components/PromoIcon';
import ProductApi from '@/core/client/api/Product';
import ProductCard from '@/core/client/features/shop/components/ProductCard';
import type { ProductQuery, ProductSummary } from '@/shared/types/product';

interface ProductRailProps {
  title: string;
  note?: string;
  icon: PromoIconName;
  tone?: 'hot' | 'new' | 'deal' | 'plain';
  href?: string;
  query?: ProductQuery;
  products?: ProductSummary[];
  ranked?: boolean;
  aside?: ReactNode;
}

// A horizontal shelf of product cards that slides by itself (pausing while hovered): best sellers with their rank,
// new arrivals, good prices, or the visitor's recently viewed kits. Renders nothing when the shelf would be empty.
export default function ProductRail({
  title,
  note,
  icon,
  tone = 'plain',
  href,
  query,
  products: given,
  ranked = false,
  aside,
}: ProductRailProps) {
  const en = useLocale() === 'en';
  const [products, setProducts] = useState<ProductSummary[] | undefined>(given);
  const signature = JSON.stringify(query ?? null);
  useEffect(() => {
    if (given) {
      setProducts(given);
      return;
    }
    let active = true;
    void ProductApi.getProducts({ per_page: 12, ...(JSON.parse(signature) as ProductQuery) }).then((result) => {
      if (active) setProducts(result?.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [given, signature]);
  if (products && products.length === 0) return null;
  return (
    <section className={`product-rail mu-wrap is-${tone}`}>
      <header className="product-rail-head">
        <span className="product-rail-icon">
          <PromoIcon name={icon} size={20} />
        </span>
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {aside}
        {href && (
          <Link href={href} className="product-rail-more">
            {en ? 'See all' : 'Xem tất cả'} <PromoIcon name="arrow" size={14} />
          </Link>
        )}
      </header>
      {products ? (
        <Carousel
          label={title}
          className="product-rail-carousel"
          autoplayMs={4200}
          dots={false}
          loop={products.length > 5}
        >
          {products.map((product, index) => (
            <div key={product.id} className="product-rail-item">
              {ranked && index < 10 && <span className={`rail-rank is-${Math.min(index + 1, 4)}`}>{index + 1}</span>}
              <ProductCard product={product} />
            </div>
          ))}
        </Carousel>
      ) : (
        <div className="product-rail-skeleton" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      )}
    </section>
  );
}
