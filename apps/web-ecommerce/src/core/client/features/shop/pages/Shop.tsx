'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import ProductApi from '@/core/client/api/Product';
import CategoryApi from '@/core/client/api/Category';
import type { Pagination } from '@/shared/types/pagination';
import type { Category, ProductFilterOptions, ProductSort, ProductSummary } from '@/shared/types/product';
import ProductFilters, { ProductFilterValues } from '../components/ProductFilters';
import ProductGrid from '../components/ProductGrid';
import StorePagination from '../components/StorePagination';

const PAGE_SIZE = 12;
const DEFAULT_SORT: ProductSort = 'newest';

const Shop = () => {
  const t = useTranslations('catalog');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterOptions, setFilterOptions] = useState<ProductFilterOptions>({
    brands: [],
    priceRange: { min: 0, max: 0 },
  });
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);

  const priceLimit = filterOptions.priceRange.max;

  // The URL is the source of truth for the applied filters.
  const applied = useMemo(() => {
    const maxPrice = Number(searchParams.get('maxPrice'));
    return {
      q: searchParams.get('q') || '',
      category: searchParams.get('category') || '',
      gender: '',
      grade: searchParams.get('grade') || '',
      scale: searchParams.get('scale') || '',
      series: searchParams.get('series') || '',
      condition: searchParams.get('condition') || '',
      brand: searchParams.get('brand') || '',
      maxPrice: maxPrice > 0 ? maxPrice : undefined,
      inStock: searchParams.get('inStock') === 'true',
      outletOnly: searchParams.get('channel') === 'outlet',
      sort: (searchParams.get('sort') as ProductSort) || DEFAULT_SORT,
      page: Math.max(1, Number(searchParams.get('page')) || 1),
    };
  }, [searchParams]);

  const [draft, setDraft] = useState<ProductFilterValues>({
    ...applied,
    maxPrice: applied.maxPrice ?? 0,
  });

  useEffect(() => {
    CategoryApi.getCategories().then(setCategories);
    ProductApi.getFilterOptions().then((options) => options && setFilterOptions(options));
  }, []);

  // Keep the form in sync with the URL (back/forward navigation, reset) once the price limit is known.
  useEffect(() => {
    setDraft({ ...applied, maxPrice: applied.maxPrice ?? priceLimit });
  }, [applied, priceLimit]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const result = await ProductApi.getProducts({
        q: applied.q,
        category: applied.category,
        grade: applied.grade,
        scale: applied.scale,
        series: applied.series,
        condition: applied.condition,
        brand: applied.brand,
        maxPrice: applied.maxPrice,
        inStock: applied.inStock,
        channel: applied.outletOnly ? 'outlet' : '',
        sort: applied.sort,
        page: applied.page,
        per_page: PAGE_SIZE,
      });
      setProducts(result?.data || []);
      setPagination(result?.pagination);
      setLoading(false);
    };
    load();
  }, [applied]);

  const navigate = (values: Partial<ProductFilterValues> & { page?: number }) => {
    const params = new URLSearchParams();
    if (values.q?.trim()) params.set('q', values.q.trim());
    if (values.category) params.set('category', values.category);
    for (const field of ['grade', 'scale', 'series', 'condition'] as const) {
      if (values[field]) params.set(field, values[field] as string);
    }
    if (values.brand) params.set('brand', values.brand);
    if (values.maxPrice && values.maxPrice < priceLimit) params.set('maxPrice', String(values.maxPrice));
    if (values.inStock) params.set('inStock', 'true');
    if (values.outletOnly) params.set('channel', 'outlet');
    if (values.sort && values.sort !== DEFAULT_SORT) params.set('sort', values.sort);
    if (values.page && values.page > 1) params.set('page', String(values.page));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="mu-wrap mu-section">
      <p className="mu-eyebrow" style={{color:'#168796'}}>MODEL UNIVERSE / CATALOG</p><h1 className="mu-heading mb-2 mt-3">{t('title')}</h1><p className="mu-note mb-8">{t('subtitle')}</p>
      <ProductFilters
        values={draft}
        categories={categories}
        brands={filterOptions.brands}
        priceLimit={priceLimit}
        onChange={setDraft}
        onSubmit={() => navigate(draft)}
        onReset={() => router.push(pathname)}
      />
      <p className="my-6 text-body dark:text-store-muted">
        {pagination ? t('results', { count: pagination.total }) : ' '}
      </p>
      <ProductGrid products={products} loading={loading} emptyText={t('empty')} />
      <StorePagination
        pagination={pagination}
        onPageChange={(page) => {
          navigate({ ...applied, maxPrice: applied.maxPrice, page });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
};

export default Shop;
