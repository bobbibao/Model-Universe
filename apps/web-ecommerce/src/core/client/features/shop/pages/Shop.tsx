'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import ProductApi from '@/core/client/api/Product';
import CategoryApi from '@/core/client/api/Category';
import type { Pagination } from '@/shared/types/pagination';
import type { Category, ProductFilterOptions, ProductSort, ProductSummary } from '@/shared/types/product';
import ProductFilters, { ProductFilterValues, SORT_OPTIONS } from '../components/ProductFilters';
import ProductGrid from '../components/ProductGrid';
import StorePagination from '../components/StorePagination';
import AdminIcon from '@/components/Admin/AdminIcon';
import { shopPath } from '@/shared/slug';

const PAGE_SIZE = 12;
const DEFAULT_SORT: ProductSort = 'newest';

// The catalog. On a category landing page (/cua-hang/<category>) the category comes from the path; filters stay in
// the query string and choosing another category moves to its own path (one canonical URL per category).
const Shop = ({ categorySlug = '' }: { categorySlug?: string } = {}) => {
  const t = useTranslations('catalog');
  const router = useRouter();
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setFiltersOpen(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

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
      category: categorySlug || searchParams.get('category') || '',
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
  }, [searchParams, categorySlug]);
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

  const pendingUrl = useRef<string | null>(null);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const cancelPending = () => {
      clearTimeout(filterTimer.current);
      pendingUrl.current = null;
    };
    window.addEventListener('popstate', cancelPending);
    return () => {
      cancelPending();
      window.removeEventListener('popstate', cancelPending);
    };
  }, []);

  // Ignore intermediate navigations when several filters are changed quickly.
  // Back/forward navigation still restores the controls once the latest URL settles.
  useEffect(() => {
    const query = searchParams.toString();
    const currentUrl = `${shopPath(applied.category)}${query ? `?${query}` : ''}`;
    if (pendingUrl.current && pendingUrl.current !== currentUrl) return;
    pendingUrl.current = null;
    setDraft({ ...applied, minPrice: applied.minPrice ?? 0, maxPrice: applied.maxPrice });
  }, [applied, searchParams]);

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
    const path = shopPath(values.category);
    const url = query ? `${path}?${query}` : path;
    clearTimeout(filterTimer.current);
    const currentQuery = searchParams.toString();
    const currentUrl = `${shopPath(applied.category)}${currentQuery ? `?${currentQuery}` : ''}`;
    pendingUrl.current = url === currentUrl ? null : url;
    if (url === currentUrl) {
      setDraft({ ...applied, minPrice: applied.minPrice ?? 0, maxPrice: applied.maxPrice });
    }
    router.push(url, { scroll: false });
  };

  const changeFilters = (values: ProductFilterValues) => {
    setDraft(values);
    clearTimeout(filterTimer.current);
    pendingUrl.current = 'editing';
    // Choices apply immediately; typing and dragging wait until the input pauses.
    const debounce =
      values.series !== draft.series || values.minPrice !== draft.minPrice || values.maxPrice !== draft.maxPrice;
    if (debounce) filterTimer.current = setTimeout(() => navigate({ ...values, page: 1 }), 300);
    else navigate({ ...values, page: 1 });
  };

  return (
    <div className="mu-wrap mu-section catalog-page">
      <header className="catalog-page-header">
        <div>
          <p className="mu-eyebrow">MODEL UNIVERSE / CATALOG</p>
          <h1 className="mu-heading">
            {categories.find((category) => category.slug === applied.category)?.name || t('title')}
          </h1>
          <p className="mu-note">{t('subtitle')}</p>
        </div>
      </header>
      <div className="catalog-layout">
        <section className="catalog-main" aria-label={t('title')} aria-busy={loading}>
          <div className="catalog-toolbar">
            <form
              className="catalog-search-input"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                navigate({ ...draft, page: 1 });
              }}
            >
              <AdminIcon name="search" size={18} />
              <label className="sr-only" htmlFor="filter-q">
                {t('search')}
              </label>
              <input
                id="filter-q"
                type="search"
                className="mu-input"
                placeholder={t('search')}
                value={draft.q}
                onChange={(event) => setDraft({ ...draft, q: event.target.value })}
              />
              <button type="submit" aria-label={t('search')}>
                <AdminIcon name="arrow" size={18} />
              </button>
            </form>
            <div className="catalog-sort">
              <label className="sr-only" htmlFor="filter-sort">
                {t('sort')}
              </label>
              <select
                id="filter-sort"
                className="mu-input"
                value={draft.sort}
                onChange={(event) => changeFilters({ ...draft, sort: event.target.value as ProductSort })}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.value)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {failed ? (
            <div role="alert" className="catalog-error">
              <p>{t('loadFailed')}</p>
              <button className="mu-button mu-button-secondary" onClick={() => setRetry((value) => value + 1)}>
                {common('retry')}
              </button>
            </div>
          ) : (
            <p role="status" aria-live="polite" className="catalog-results">
              {loading ? common('loading') : pagination ? t('results', { count: pagination.total }) : ' '}
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
        </section>
        <aside className="catalog-sidebar" aria-label={t('filters')}>
          <details
            className="catalog-mobile-filters"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>
              <AdminIcon name="chart" size={18} />
              {t('filters')}
            </summary>
            <ProductFilters
              values={draft}
              categories={categories}
              brands={filterOptions.brands}
              priceLimit={priceLimit}
              onChange={changeFilters}
              onReset={() => navigate({})}
            />
          </details>
        </aside>
      </div>
    </div>
  );
};

export default Shop;
