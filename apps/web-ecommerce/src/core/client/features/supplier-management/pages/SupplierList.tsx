'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import SupplierApi, { SupplierListParams } from '@/core/client/api/Supplier';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { Supplier } from '@/shared/types/product';
import SupplierModal from '../components/SupplierModal';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const SupplierList = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupplierListParams['status']>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'id', direction: 'asc' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    const result = await SupplierApi.getSuppliers({
      q: search,
      status,
      page,
      per_page: PAGE_SIZE,
      sort: sort.key,
      direction: sort.direction,
    });
    setSuppliers(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, status, page, sort]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openModal = (supplier: Supplier | null) => {
    setEditing(supplier);
    setModalOpen(true);
  };

  const remove = async () => {
    if (deleting && (await SupplierApi.deleteSupplier(deleting.id))) loadSuppliers();
    setDeleting(null);
  };

  const columns: DataTableColumn<Supplier>[] = [
    { key: 'id', header: 'ID', sortable: true },
    { key: 'name', header: 'Tên', sortable: true, className: 'min-w-[200px]' },
    { key: 'contactName', header: 'Người liên hệ', sortable: true, render: (supplier) => supplier.contactName || '—' },
    { key: 'contactPhone', header: 'Số điện thoại', render: (supplier) => supplier.contactPhone || '—' },
    { key: 'contactEmail', header: 'Email', render: (supplier) => supplier.contactEmail || '—' },
    {
      key: 'isActive',
      header: 'Trạng thái',
      render: (supplier) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            supplier.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}
        >
          {supplier.isActive ? 'Đang hợp tác' : 'Ngừng hợp tác'}
        </span>
      ),
    },
    {
      key: 'website',
      header: 'Website',
      render: (supplier) =>
        supplier.website ? (
          <a
            href={supplier.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="text-brand-hover hover:underline"
          >
            Truy cập
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (supplier) => (
        <div className="flex justify-end gap-4">
          <button onClick={() => openModal(supplier)} className="font-medium text-brand-hover hover:underline">
            Sửa
          </button>
          <button onClick={() => setDeleting(supplier)} className="font-medium text-danger hover:underline">
            Xoá
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Nhà cung cấp" />
      <DataTable
        title="Danh sách nhà cung cấp"
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-64`}
              placeholder="Tìm theo tên, người liên hệ..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-44`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SupplierListParams['status']);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang hợp tác</option>
              <option value="inactive">Ngừng hợp tác</option>
            </select>
            <button
              onClick={() => openModal(null)}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              + Thêm nhà cung cấp
            </button>
          </>
        }
        columns={columns}
        data={suppliers}
        rowKey={(supplier) => supplier.id}
        loading={loading}
        emptyText="Không tìm thấy nhà cung cấp nào"
        sort={sort}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        pagination={pagination}
        onPageChange={setPage}
      />

      <SupplierModal
        open={modalOpen}
        supplier={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          loadSuppliers();
        }}
      />
      <ConfirmModal
        open={!!deleting}
        title="Xoá nhà cung cấp"
        message={
          <>
            Bạn có chắc muốn xoá <strong>{deleting?.name}</strong>? Nhà cung cấp đang có sản phẩm thì chỉ có thể chuyển
            sang trạng thái ngừng hợp tác.
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

export default SupplierList;
