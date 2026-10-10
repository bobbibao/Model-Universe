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
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const common = useTranslations('common');

  // The URL is the source of truth for the applied filters.
  const applied = useMemo(() => {
    const price = (key: string) => {
      const raw = searchParams.get(key);
      const value = Number(raw);
      return raw !== null && raw !== '' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647
        ? value
        : undefined;
    };
    const minPrice = price('minPrice');
    const maxPrice = price('maxPrice');
    return {
      q: searchParams.get('q') || '',
      category: searchParams.get('category') || '',
      gender: '',
      grade: searchParams.get('grade') || '',
      scale: searchParams.get('scale') || '',
      series: searchParams.get('series') || '',
      condition: searchParams.get('condition') || '',
      assemblyState: searchParams.get('assemblyState') || '',
      brand: searchParams.get('brand') || '',
      minPrice,
      maxPrice: maxPrice === undefined ? undefined : Math.max(minPrice ?? 0, maxPrice),
      inStock: searchParams.get('inStock') === 'true',
      outletOnly: searchParams.get('channel') === 'outlet',
      sort: (['newest', 'price_asc', 'price_desc', 'name', 'best_selling', 'rating'].includes(
        searchParams.get('sort') || '',
      )
        ? searchParams.get('sort')
        : DEFAULT_SORT) as ProductSort,
      page: Math.max(1, Number(searchParams.get('page')) || 1),
    };
  }, [searchParams]);
  const priceLimit = Math.max(filterOptions.priceRange.max, applied.minPrice ?? 0, applied.maxPrice ?? 0);

  const [draft, setDraft] = useState<ProductFilterValues>({
    ...applied,
    minPrice: applied.minPrice ?? 0,
    maxPrice: applied.maxPrice,
  });

  useEffect(() => {
    CategoryApi.getCategories().then(setCategories);
    ProductApi.getFilterOptions().then((options) => options && setFilterOptions(options));
  }, []);

  // Applied URLs reset drafts; arriving price metadata never changes a customer's selection.
  useEffect(() => {
    setDraft({ ...applied, minPrice: applied.minPrice ?? 0, maxPrice: applied.maxPrice });
  }, [applied]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      const result = await ProductApi.getProducts({
        q: applied.q,
        category: applied.category,
        grade: applied.grade,
        scale: applied.scale,
        series: applied.series,
        condition: applied.condition,
        assemblyState: applied.assemblyState,
        brand: applied.brand,
        minPrice: applied.minPrice,
        maxPrice: applied.maxPrice,
        inStock: applied.inStock,
        channel: applied.outletOnly ? 'outlet' : '',
        sort: applied.sort,
        page: applied.page,
        per_page: PAGE_SIZE,
      });
      if (cancelled) return;
      setFailed(!result);
      setProducts(result?.data || []);
      setPagination(result?.pagination);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applied, retry]);

  const navigate = (values: Partial<ProductFilterValues> & { page?: number }) => {
    const params = new URLSearchParams();
    if (values.q?.trim()) params.set('q', values.q.trim());
    if (values.category) params.set('category', values.category);
    for (const field of ['grade', 'scale', 'series', 'condition', 'assemblyState'] as const) {
      if (values[field]) params.set(field, values[field] as string);
    }
    if (values.brand) params.set('brand', values.brand);
    if (values.minPrice && values.minPrice > 0) params.set('minPrice', String(values.minPrice));
    if (values.maxPrice !== undefined && values.maxPrice < priceLimit) params.set('maxPrice', String(values.maxPrice));
    if (values.inStock) params.set('inStock', 'true');
    if (values.outletOnly) params.set('channel', 'outlet');
    if (values.sort && values.sort !== DEFAULT_SORT) params.set('sort', values.sort);
    if (values.page && values.page > 1) params.set('page', String(values.page));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="mu-wrap mu-section">
      <p className="mu-eyebrow" style={{ color: '#168796' }}>
        MODEL UNIVERSE / CATALOG
      </p>
      <h1 className="mu-heading mb-2 mt-3">{t('title')}</h1>
      <p className="mu-note mb-8">{t('subtitle')}</p>
      <ProductFilters
        values={draft}
        categories={categories}
        brands={filterOptions.brands}
        priceLimit={priceLimit}
        onChange={setDraft}
        onSubmit={() => navigate(draft)}
        onReset={() => router.push(pathname)}
      />
      {failed ? (
        <div role="alert" className="catalog-error">
          <p>{t('loadFailed')}</p>
          <button className="mu-button mu-button-secondary" onClick={() => setRetry((value) => value + 1)}>
            {common('retry')}
          </button>
        </div>
      ) : (
        <p role="status" aria-live="polite" className="catalog-results">
          {pagination ? t('results', { count: pagination.total }) : ' '}
        </p>
      )}
      {!failed && <ProductGrid products={products} loading={loading} emptyText={t('empty')} />}
      {!failed && (
        <StorePagination
          pagination={pagination}
          onPageChange={(page) => {
            navigate({ ...applied, maxPrice: applied.maxPrice, page });
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
          }}
        />
      )}
    </div>
  );
};

export default Shop;
