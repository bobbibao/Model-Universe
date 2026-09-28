'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import CouponApi, { CouponListParams } from '@/core/client/api/Coupon';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { Coupon } from '@/shared/types/order';
import CouponModal from '../components/CouponModal';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const formatDate = (value: string) => new Date(value).toLocaleDateString('vi-VN');

const couponState = (coupon: Coupon): { label: string; className: string } => {
  const now = Date.now();
  if (!coupon.isActive) return { label: 'Tạm dừng', className: 'bg-body/10 text-body' };
  if (new Date(coupon.expirationDate).getTime() < now)
    return { label: 'Hết hạn', className: 'bg-danger/10 text-danger' };
  if (new Date(coupon.startDate).getTime() > now)
    return { label: 'Sắp diễn ra', className: 'bg-meta-5/10 text-meta-5' };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { label: 'Hết lượt', className: 'bg-warning/10 text-warning' };
  }
  return { label: 'Đang áp dụng', className: 'bg-success/10 text-success' };
};

const CouponList = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CouponListParams['status']>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'id', direction: 'desc' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    const result = await CouponApi.getCoupons({
      q: search,
      status,
      page,
      per_page: PAGE_SIZE,
      sort: sort.key,
      direction: sort.direction,
    });
    setCoupons(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, status, page, sort]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const openModal = (coupon: Coupon | null) => {
    setEditing(coupon);
    setModalOpen(true);
  };

  const remove = async () => {
    if (deleting && (await CouponApi.deleteCoupon(deleting.id))) loadCoupons();
    setDeleting(null);
  };

  const columns: DataTableColumn<Coupon>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (coupon) => <span className="font-semibold">{coupon.code}</span>,
    },
    { key: 'title', header: 'Tiêu đề', className: 'min-w-[180px]' },
    { key: 'discountPercent', header: 'Giảm giá', sortable: true, render: (coupon) => `${coupon.discountPercent}%` },
    { key: 'usageLimit', header: 'Giới hạn', render: (coupon) => coupon.usageLimit ?? 'Không giới hạn' },
    { key: 'usageCount', header: 'Đã sử dụng', sortable: true },
    { key: 'startDate', header: 'Ngày bắt đầu', sortable: true, render: (coupon) => formatDate(coupon.startDate) },
    {
      key: 'expirationDate',
      header: 'Ngày hết hạn',
      sortable: true,
      render: (coupon) => formatDate(coupon.expirationDate),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      render: (coupon) => {
        const state = couponState(coupon);
        return <span className={`rounded-full px-3 py-1 text-xs font-medium ${state.className}`}>{state.label}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (coupon) => (
        <div className="flex justify-end gap-4">
          <button onClick={() => openModal(coupon)} className="font-medium text-brand-hover hover:underline">
            Sửa
          </button>
          <button onClick={() => setDeleting(coupon)} className="font-medium text-danger hover:underline">
            Xoá
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Khuyến mãi" />
      <DataTable
        title="Danh sách khuyến mãi"
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-56`}
              placeholder="Tìm theo mã, tiêu đề..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-44`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CouponListParams['status']);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang áp dụng</option>
              <option value="expired">Hết hạn</option>
              <option value="inactive">Tạm dừng</option>
            </select>
            <button
              onClick={() => openModal(null)}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              + Thêm khuyến mãi
            </button>
          </>
        }
        columns={columns}
        data={coupons}
        rowKey={(coupon) => coupon.id}
        loading={loading}
        emptyText="Không tìm thấy khuyến mãi nào"
        sort={sort}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        pagination={pagination}
        onPageChange={setPage}
      />

      <CouponModal
        open={modalOpen}
        coupon={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          loadCoupons();
        }}
      />
      <ConfirmModal
        open={!!deleting}
        title="Xoá khuyến mãi"
        message={
          <>
            Bạn có chắc muốn xoá mã <strong>{deleting?.code}</strong>? Mã đã được dùng trong đơn hàng chỉ có thể tạm
            dừng.
          </>
        }
        confirmLabel="Xoá"
        danger
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
};

export default CouponList;
