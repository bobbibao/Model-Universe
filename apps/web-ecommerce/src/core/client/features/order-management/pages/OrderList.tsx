'use client';

import { useCallback, useEffect, useState } from 'react';
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

const formatDateTime = (value: string) => new Date(value).toLocaleString('vi-VN');

const OrderList = () => {
  const router = useRouter();
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
    { key: 'createdAt', header: 'Ngày tạo', sortable: true, render: (order) => formatDateTime(order.createdAt) },
    {
      key: 'customer',
      header: 'Khách hàng',
      render: (order) => (
        <div>
          <p className="font-medium">{order.recipientName}</p>
          <p className="text-sm text-body">{order.user?.email}</p>
        </div>
      ),
    },
    { key: 'total', header: 'Tổng tiền', sortable: true, render: (order) => formatVND(order.total) },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      key: 'updatedAt',
      header: 'Lần cập nhật cuối',
      sortable: true,
      render: (order) => formatDateTime(order.updatedAt),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Đơn hàng" />
      <DataTable
        title="Danh sách đơn hàng"
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-64`}
              placeholder="Mã đơn, người nhận, SĐT, email..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-44`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | '');
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
                <option key={value} value={value}>
                  {ORDER_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </>
        }
        columns={columns}
        data={orders}
        rowKey={(order) => order.id}
        loading={loading}
        emptyText="Không tìm thấy đơn hàng nào"
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
