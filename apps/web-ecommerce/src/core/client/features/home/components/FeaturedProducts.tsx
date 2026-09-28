'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProductApi from '@/core/client/api/Product';
import ProductGrid from '@/core/client/features/shop/components/ProductGrid';
import type { ProductSummary } from '@/shared/types/product';

const FEATURED_COUNT = 8;

const FeaturedProducts = () => {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ProductApi.getProducts({ featured: true, per_page: FEATURED_COUNT }).then((result) => {
      setProducts(result?.data || []);
      setLoading(false);
    });
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-stroke pb-4 dark:border-store-card">
        <h2 className="text-3xl font-bold">Các sản phẩm nổi bật</h2>
        <Link href="/shop" className="font-medium text-brand-hover hover:underline">
          Xem tất cả
        </Link>
      </div>
      <ProductGrid products={products} loading={loading} emptyText="Chưa có sản phẩm nổi bật." />
    </section>
  );
};

export default FeaturedProducts;
