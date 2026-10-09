'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ProductApi from '@/core/client/api/Product';
import ProductGrid from '@/core/client/features/shop/components/ProductGrid';
import type { ProductSummary } from '@/shared/types/product';

const FEATURED_COUNT = 8;

const FeaturedProducts = ({ initialProducts }: { initialProducts?: ProductSummary[] }) => {
  const t = useTranslations('home');
  const catalog = useTranslations('catalog');
  const [products, setProducts] = useState<ProductSummary[]>(initialProducts || []);
  const [loading, setLoading] = useState(initialProducts === undefined);

  useEffect(() => {
    if (initialProducts !== undefined) return;
    ProductApi.getProducts({ featured: true, per_page: FEATURED_COUNT }).then((result) => {
      setProducts(result?.data || []);
      setLoading(false);
    });
  }, [initialProducts]);

  return (
    <section className="mu-wrap mu-section">
      <div className="mu-section-head">
        <div><h2 className="mu-heading">{t('featured')}</h2><p className="mu-note">{t('featuredNote')}</p></div>
        <Link href="/shop" className="font-medium text-brand-hover hover:underline">
          {catalog('all')} ↗
        </Link>
      </div>
      <ProductGrid products={products} loading={loading} emptyText={catalog('empty')} />
    </section>
  );
};

export default FeaturedProducts;
