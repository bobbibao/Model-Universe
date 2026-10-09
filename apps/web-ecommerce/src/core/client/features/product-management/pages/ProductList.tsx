'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';

import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import ProductImage from '@/components/ProductImage';
import ProductApi, { AdminProductListParams } from '@/core/client/api/Product';
import CategoryApi from '@/core/client/api/Category';
import { formatVND } from '@/shared/server/utils/utils';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { AdminProductListItem, Category } from '@/shared/types/product';

const PAGE_SIZE = 10;

// Set by the shop agent's inventory adjustments; such products are hidden from the storefront.
const SEARCH_DEBOUNCE_MS = 400;

const ProductList = () => {
  const router = useRouter();
  const t = useTranslations('adminProducts'),
    locale = useLocale();
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [status, setStatus] = useState<AdminProductListParams['status']>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'id', direction: 'desc' });

  useEffect(() => {
    CategoryApi.getAdminCategories().then((result) => setCategories(result || []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const result = await ProductApi.getAdminProducts({
      q: search,
      categoryId,
      status,
      page,
      per_page: PAGE_SIZE,
      sort: sort.key,
      direction: sort.direction,
    });
    setProducts(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, categoryId, status, page, sort]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const columns: DataTableColumn<AdminProductListItem>[] = [
    {
      key: 'imageUrl',
      header: t('image'),
      render: (product) => (
        <div className="relative h-14 w-14 overflow-hidden rounded bg-gray-2 dark:bg-meta-4">
          <ProductImage src={product.imageUrl} alt={product.name} sizes="56px" />
        </div>
      ),
    },
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      className: 'min-w-[240px]',
      render: (product) => (
        <div>
          <p className="font-medium">{product.name}</p>
          <p className="text-sm text-body">SKU: {product.sku}</p>
        </div>
      ),
    },
    { key: 'category', header: t('category'), render: (product) => product.category?.name || '—' },
    {
      key: 'price',
      header: t('price'),
      sortable: true,
      render: (product) => (
        <div>
          <p>{formatVND(product.salePrice, locale)}</p>
          {product.discountPercent > 0 && (
            <p className="text-xs text-body">
              <span className="line-through">{formatVND(product.price, locale)}</span> -
              {Math.round(product.discountPercent)}%
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'stock',
      header: t('stock'),
      sortable: true,
      render: (product) => <span className={product.stock === 0 ? 'text-danger' : ''}>{product.stock}</span>,
    },
    { key: 'sold', header: t('sold'), sortable: true },
    {
      key: 'isArchived',
      header: t('status'),
      render: (product) => (
        <div className="flex flex-wrap gap-1">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              product.isArchived ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
            }`}
          >
            {product.isArchived ? t('archived') : t('active')}
          </span>
          {product.isFeatured && (
            <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
              {t('featured')}
            </span>
          )}
          {product.inventoryStatus !== 'available' && (
            <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
              {t(`inventoryStates.${product.inventoryStatus}`)}
            </span>
          )}
          {product.salesChannel === 'outlet' && (
            <span className="rounded-full bg-meta-5/10 px-3 py-1 text-xs font-medium text-meta-5">Outlet</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName={t('title')} />
      <DataTable
        title={t('list')}
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-64`}
              placeholder={t('search')}
              aria-label={t('search')}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-44`}
              aria-label={t('category')}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value ? Number(event.target.value) : '');
                setPage(1);
              }}
            >
              <option value="">{t('allCategories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className={`${inputClassName} !py-2 sm:w-40`}
              aria-label={t('status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as AdminProductListParams['status']);
                setPage(1);
              }}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="active">{t('active')}</option>
              <option value="archived">{t('archived')}</option>
              <option value="featured">{t('featured')}</option>
              <option value="held">{t('held')}</option>
            </select>
            <Link
              href="/admin/products/new"
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              {t('create')}
            </Link>
          </>
        }
        columns={columns}
        data={products}
        rowKey={(product) => product.id}
        loading={loading}
        emptyText={t('empty')}
        onRowClick={(product) => router.push(`/admin/products/${product.id}`)}
        sort={sort}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        pagination={pagination}
        onPageChange={setPage}
      />
    </>
  );
};

export default ProductList;
