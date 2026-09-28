'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import UserApi from '@/core/client/api/User';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { User, UserRole } from '@/shared/types/user';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const genderLabel = (gender: User['gender']) => (gender === 'M' ? 'Nam' : gender === 'F' ? 'Nữ' : 'Chưa cập nhật');

const CustomerList = () => {
  const { user: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'id', direction: 'asc' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const result = await UserApi.getUsers({
      q: search,
      role,
      page,
      per_page: PAGE_SIZE,
      sort: sort.key,
      direction: sort.direction,
    });
    setUsers(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, role, page, sort]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const replaceUser = (updated: User) =>
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));

  const changeRole = async (user: User, nextRole: UserRole) => {
    const updated = await UserApi.updateRole(user.id, nextRole);
    if (updated) replaceUser(updated);
  };

  const toggleStatus = async (user: User) => {
    const updated = await UserApi.updateStatus(user.id, !user.isActive);
    if (updated) replaceUser(updated);
  };

  const columns: DataTableColumn<User>[] = [
    { key: 'id', header: 'ID', sortable: true },
    { key: 'lastName', header: 'Họ', sortable: true },
    { key: 'firstName', header: 'Tên', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'gender', header: 'Giới tính', render: (user) => genderLabel(user.gender) },
    { key: 'address', header: 'Địa chỉ', className: 'min-w-[200px]', render: (user) => user.address || '—' },
    { key: 'phone', header: 'Số điện thoại', render: (user) => user.phone || '—' },
    {
      key: 'role',
      header: 'Quyền',
      render: (user) => (
        <select
          className="rounded border border-stroke bg-transparent px-2 py-1 dark:border-strokedark dark:bg-form-input"
          value={user.role}
          disabled={user.id === currentUser?.id}
          onChange={(event) => changeRole(user, event.target.value as UserRole)}
        >
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
      ),
    },
    {
      key: 'isActive',
      header: 'Trạng thái',
      render: (user) => (
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              user.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
            }`}
          >
            {user.isActive ? 'Hoạt động' : 'Đã khoá'}
          </span>
          {user.id !== currentUser?.id && (
            <button onClick={() => toggleStatus(user)} className="text-sm font-medium text-brand-hover hover:underline">
              {user.isActive ? 'Khoá' : 'Mở khoá'}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Khách hàng" />
      <DataTable
        title="Danh sách khách hàng"
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-72`}
              placeholder="Tìm theo tên, email, số điện thoại..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-40`}
              value={role}
              onChange={(event) => {
                setRole(event.target.value as UserRole | '');
                setPage(1);
              }}
            >
              <option value="">Tất cả quyền</option>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </>
        }
        columns={columns}
        data={users}
        rowKey={(user) => user.id}
        loading={loading}
        emptyText="Không tìm thấy khách hàng nào"
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

export default CustomerList;
