'use client';

import { useState } from 'react';
import Link from '@/i18n/navigation';
import ClickOutside from '@/components/ClickOutside';
import UserAvatar from '@/components/UserAvatar';
import { useLogout } from '@/shared/client/hooks/useLogout';
import type { User } from '@/shared/types/user';

const menuItemClassName =
  'block w-full px-4 py-2.5 text-left text-black hover:bg-gray-2 dark:text-store-text dark:hover:bg-store-card';

const UserMenu = ({ user }: { user: User }) => {
  const [open, setOpen] = useState(false);
  const { logout } = useLogout();

  return (
    <ClickOutside onClick={() => setOpen(false)} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Tài khoản" aria-expanded={open} className="flex items-center">
        <UserAvatar user={user} />
      </button>
      {open && (
        <div className="absolute right-0 z-9999 mt-3 w-56 overflow-hidden rounded-md border border-stroke bg-white shadow-default dark:border-store-card dark:bg-store-panel">
          <div className="border-b border-stroke px-4 py-3 dark:border-store-card">
            <p className="truncate font-semibold text-black dark:text-white">
              {user.lastName} {user.firstName}
            </p>
            <p className="truncate text-sm text-body dark:text-store-muted">{user.email}</p>
          </div>
          <Link href="/user-profile" className={menuItemClassName} onClick={() => setOpen(false)}>
            Trang cá nhân
          </Link>
          <Link href="/order-history" className={menuItemClassName} onClick={() => setOpen(false)}>
            Lịch sử đơn hàng
          </Link>
          {user.role === 'ADMIN' && (
            <Link href="/admin/dashboard" className={menuItemClassName} onClick={() => setOpen(false)}>
              Trang quản trị
            </Link>
          )}
          <button
            className={`${menuItemClassName} border-t border-stroke dark:border-store-card`}
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </ClickOutside>
  );
};

export default UserMenu;
