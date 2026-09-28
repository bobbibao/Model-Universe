'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
      gender: searchParams.get('gender') || '',
      brand: searchParams.get('brand') || '',
      maxPrice: maxPrice > 0 ? maxPrice : undefined,
      inStock: searchParams.get('inStock') === 'true',
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
        gender: applied.gender,
        brand: applied.brand,
        maxPrice: applied.maxPrice,
        inStock: applied.inStock,
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
    if (values.gender) params.set('gender', values.gender);
    if (values.brand) params.set('brand', values.brand);
    if (values.maxPrice && values.maxPrice < priceLimit) params.set('maxPrice', String(values.maxPrice));
    if (values.inStock) params.set('inStock', 'true');
    if (values.sort && values.sort !== DEFAULT_SORT) params.set('sort', values.sort);
    if (values.page && values.page > 1) params.set('page', String(values.page));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Sản phẩm</h1>
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
        {pagination ? `Tìm thấy ${pagination.total} sản phẩm` : ' '}
      </p>
      <ProductGrid products={products} loading={loading} emptyText="Không tìm thấy sản phẩm phù hợp với bộ lọc." />
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
