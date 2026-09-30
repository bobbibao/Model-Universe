'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import ProductImage from '@/components/ProductImage';
import ProductApi, { AdminProductListParams } from '@/core/client/api/Product';
import CategoryApi from '@/core/client/api/Category';
import { formatVND } from '@/shared/server/utils/utils';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { AdminProductListItem, Category, InventoryStatus } from '@/shared/types/product';

const PAGE_SIZE = 10;

// Set by the shop agent's inventory adjustments; such products are hidden from the storefront.
const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  available: 'Sẵn sàng bán',
  quarantine: 'Cách ly kiểm tra',
  donation_pending: 'Chờ quyên góp',
  recycle: 'Chờ tái chế',
};
const SEARCH_DEBOUNCE_MS = 400;

const ProductList = () => {
  const router = useRouter();
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
      header: 'Ảnh',
      render: (product) => (
        <div className="relative h-14 w-14 overflow-hidden rounded bg-gray-2 dark:bg-meta-4">
          <ProductImage src={product.imageUrl} alt={product.name} sizes="56px" />
        </div>
      ),
    },
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'name',
      header: 'Tên sản phẩm',
      sortable: true,
      className: 'min-w-[240px]',
      render: (product) => (
        <div>
          <p className="font-medium">{product.name}</p>
          <p className="text-sm text-body">SKU: {product.sku}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Danh mục', render: (product) => product.category?.name || '—' },
    {
      key: 'price',
      header: 'Giá bán',
      sortable: true,
      render: (product) => (
        <div>
          <p>{formatVND(product.salePrice)}</p>
          {product.discountPercent > 0 && (
            <p className="text-xs text-body">
              <span className="line-through">{formatVND(product.price)}</span> -{Math.round(product.discountPercent)}%
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Tồn kho',
      sortable: true,
      render: (product) => <span className={product.stock === 0 ? 'text-danger' : ''}>{product.stock}</span>,
    },
    { key: 'sold', header: 'Đã bán', sortable: true },
    {
      key: 'isArchived',
      header: 'Trạng thái',
      render: (product) => (
        <div className="flex flex-wrap gap-1">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              product.isArchived ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
            }`}
          >
            {product.isArchived ? 'Tạm ngưng' : 'Đang bán'}
          </span>
          {product.isFeatured && (
            <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">Nổi bật</span>
          )}
          {product.inventoryStatus !== 'available' && (
            <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
              {INVENTORY_STATUS_LABELS[product.inventoryStatus]}
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
      <Breadcrumb pageName="Sản phẩm" />
      <DataTable
        title="Danh sách sản phẩm"
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-64`}
              placeholder="Tìm theo tên, thương hiệu, SKU..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-44`}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value ? Number(event.target.value) : '');
                setPage(1);
              }}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className={`${inputClassName} !py-2 sm:w-40`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as AdminProductListParams['status']);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang bán</option>
              <option value="archived">Tạm ngưng</option>
              <option value="featured">Nổi bật</option>
              <option value="held">Tạm giữ (AI)</option>
            </select>
            <Link
              href="/admin/products/new"
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              + Thêm sản phẩm
            </Link>
          </>
        }
        columns={columns}
        data={products}
        rowKey={(product) => product.id}
        loading={loading}
        emptyText="Không tìm thấy sản phẩm nào"
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
