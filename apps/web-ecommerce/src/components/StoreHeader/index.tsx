'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Link, { usePathname } from '@/i18n/navigation';
import BrandLogo from '@/components/BrandLogo';
import CartDropdown from './CartDropdown';
import AdminIcon from '@/components/Admin/AdminIcon';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import { useComparison } from '@/shared/client/providers/ComparisonProvider';

export default function StoreHeader() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);
  const { user } = useCurrentUser();
  const assistant = useCustomerAssistant();
  const comparison = useComparison();
  const links = [
    { key: 'shop', href: '/shop' },
    { key: 'services', href: '/services' },
    { key: 'assistant', href: '/assistant' },
    { key: 'compare', href: '/compare' },
  ];
  const switchHref = search.size ? `${pathname}?${search.toString()}` : pathname;
  // Session-dependent destinations need fresh navigation rather than a guest-prefetched redirect.
  const accountHref = `/${locale}${user ? '/user-profile' : '/auth/signin'}`;
  return (
    <>
      <header className="mu-header">
        <div className="mu-wrap mu-nav">
          <BrandLogo className="text-white [&>span]:text-lg [&>svg]:text-brand sm:[&>span]:text-xl" />
          <nav className="mu-links" aria-label={t('menu')}>
            {links.map((link) => (
              <Link key={link.key} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
                {t(link.key)}
                {link.key === 'compare' && comparison.ids.length > 0 && ` (${comparison.ids.length})`}
              </Link>
            ))}
          </nav>
          <div className="mu-actions">
            <a
              href={`/${locale === 'vi' ? 'en' : 'vi'}${switchHref}`}
              aria-label={locale === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
              className="font-bold"
            >
              {locale === 'vi' ? 'EN' : 'VI'}
            </a>
            <Link href="/shop#filter-q" className="mu-hide-mobile" aria-label={t('search')}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="6.5" />
                <path d="m15 15 6 6" />
              </svg>
            </Link>
            <Link
              href="/wishlist"
              className="store-saved-link mu-hide-mobile"
              aria-label={t('saved')}
              aria-current={pathname === '/wishlist' ? 'page' : undefined}
            >
              <AdminIcon name="heart" size={20} />
              <span>{t('saved')}</span>
            </Link>
            <a href={accountHref} className="mu-hide-mobile">
              {user ? t('account') : t('signin')}
            </a>
            <CartDropdown buttonClassName="flex h-10 w-10 items-center justify-center text-white" />
            <button
              ref={menuButton}
              className="xl:hidden"
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              aria-controls="store-mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="store-mobile-menu" className="mu-wrap flex flex-col gap-5 pb-6 xl:hidden" aria-label={t('menu')}>
            {[
              ...links,
              { key: 'saved', href: '/wishlist' },
              { key: 'account', href: user ? '/user-profile' : '/auth/signin' },
            ].map((link) =>
              link.key === 'account' ? (
                <a key={link.key} href={accountHref} onClick={() => setMenuOpen(false)}>
                  {t(link.key)}
                </a>
              ) : (
                <Link key={link.key} href={link.href} onClick={() => setMenuOpen(false)}>
                  {t(link.key)}
                  {link.key === 'compare' && comparison.ids.length > 0 && ` (${comparison.ids.length})`}
                </Link>
              ),
            )}
          </nav>
        )}
      </header>
      <nav className="mu-mobile-nav" aria-label={t('menu')}>
        <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
          <AdminIcon name="dashboard" size={20} />
          {t('home')}
        </Link>
        <Link
          href="/shop"
          aria-label={t('shop')}
          aria-current={pathname.startsWith('/shop') ? 'page' : undefined}
        >
          <AdminIcon name="box" size={20} />
          {t('mobileShop')}
        </Link>
        <Link
          href="/wishlist"
          aria-label={t('saved')}
          aria-current={pathname === '/wishlist' ? 'page' : undefined}
        >
          <AdminIcon name="heart" size={20} />
          {t('mobileSaved')}
        </Link>
        <button aria-label={t('assistant')} onClick={() => assistant.open()}>
          <AdminIcon name="spark" size={20} />
          {t('mobileAssistant')}
        </button>
        <a href={accountHref}>
          <AdminIcon name="users" size={20} />
          {t('account')}
        </a>
      </nav>
    </>
  );
}
