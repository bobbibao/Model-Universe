'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import ColorModeToggle from './ColorModeToggle';
import UserMenu from './UserMenu';
import CartDropdown from './CartDropdown';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';

const navLinks = [
  { label: 'Trang chủ', href: '/' },
  { label: 'Sản phẩm', href: '/shop' },
  { label: 'Về chúng tôi', href: '/about' },
  { label: 'Liên hệ', href: '/contact' },
];

const iconButtonClass =
  'flex h-10 w-10 items-center justify-center rounded-full text-black duration-200 hover:bg-gray dark:text-store-text dark:hover:bg-store-card';

const StoreHeader = () => {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, loading } = useCurrentUser();
  const guestLinks =
    !loading && !user
      ? [
          { label: 'Đăng nhập', href: '/auth/signin' },
          { label: 'Đăng ký', href: '/auth/signup' },
        ]
      : [];

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-999 border-b border-stroke bg-white dark:border-store-card dark:bg-store">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-6">
          <button
            className={`${iconButtonClass} md:hidden`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Mở menu"
            aria-expanded={menuOpen}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <BrandLogo />
          <nav className="hidden items-center gap-2 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`border-b-2 px-2.5 py-2 font-medium duration-200 hover:text-brand-hover ${
                  isActive(link.href)
                    ? 'border-brand-hover text-brand-hover'
                    : 'border-transparent text-black dark:text-store-text'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/search" className={iconButtonClass} aria-label="Tìm kiếm">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </Link>
          {guestLinks.length > 0 && (
            <>
              <Link
                href="/auth/signin"
                className="hidden rounded-md bg-gray px-3 py-2 font-medium text-black hover:opacity-90 dark:bg-store-card dark:text-store-text sm:block"
              >
                Đăng nhập
              </Link>
              <Link
                href="/auth/signup"
                className="hidden rounded-md bg-brand px-3 py-2 font-medium text-brand-ink hover:bg-brand-hover sm:block"
              >
                Đăng ký
              </Link>
            </>
          )}
          <ColorModeToggle className={iconButtonClass} />
          <Link href="/wishlist" className={iconButtonClass} aria-label="Danh sách yêu thích">
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </Link>
          <CartDropdown buttonClassName={iconButtonClass} />
          {user && <UserMenu user={user} />}
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-stroke px-4 pb-4 dark:border-store-card md:hidden">
          {[...navLinks, ...guestLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block py-2.5 font-medium ${
                isActive(link.href) ? 'text-brand-hover' : 'text-black dark:text-store-text'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
};

export default StoreHeader;
