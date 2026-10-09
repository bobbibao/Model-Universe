'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import OrderStatusBadge, { ORDER_STATUS_LABELS } from '@/components/OrderStatusBadge';
import { inputClassName } from '@/components/FormElements/TextField';
import OrderApi from '@/core/client/api/Order';
import { formatVND } from '@/shared/server/utils/utils';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { Order, OrderStatus } from '@/shared/types/order';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;


const OrderList = () => {
  const router = useRouter();
  const t = useTranslations('operationsOrders'), statusLabel = useTranslations('checkout.orderStatus'), locale = useLocale();
  const formatDateTime = (value: string) => new Date(value).toLocaleString(locale);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const result = await OrderApi.getOrders({
      q: search,
      status,
      page,
      per_page: PAGE_SIZE,
      sort: sort.key,
      direction: sort.direction,
    });
    setOrders(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, status, page, sort]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const columns: DataTableColumn<Order>[] = [
    { key: 'id', header: 'ID', sortable: true, render: (order) => `#${order.id}` },
    { key: 'createdAt', header: t('createdAt'), sortable: true, render: (order) => formatDateTime(order.createdAt) },
    {
      key: 'customer',
      header: t('customer'),
      render: (order) => (
        <div>
          <p className="font-medium">{order.recipientName}</p>
          <p className="text-sm text-body">{order.user?.email}</p>
        </div>
      ),
    },
    { key: 'total', header: t('total'), sortable: true, render: (order) => formatVND(order.total, locale) },
    {
      key: 'status',
      header: t('status'),
      sortable: true,
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      key: 'updatedAt',
      header: t('updatedAt'),
      sortable: true,
      render: (order) => formatDateTime(order.updatedAt),
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
              aria-label={t('status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | '');
                setPage(1);
              }}
            >
              <option value="">{t('allStatuses')}</option>
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </>
        }
        columns={columns}
        data={orders}
        rowKey={(order) => order.id}
        loading={loading}
        emptyText={t('empty')}
        onRowClick={(order) => router.push(`/admin/orders/${order.id}`)}
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

export default OrderList;
