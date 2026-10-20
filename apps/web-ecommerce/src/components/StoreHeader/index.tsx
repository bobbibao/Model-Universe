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
import './store-header.css';

export default function StoreHeader() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const { user } = useCurrentUser();
  const assistant = useCustomerAssistant();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, [menuOpen]);
  const links = [
    { key: 'catalogShort', href: '/cua-hang' },
    { key: 'offers', href: '/uu-dai' },
    { key: 'servicesShort', href: '/services' },
    { key: 'assistantShort', href: '/assistant' },
  ];
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const switchHref = search.size ? `${pathname}?${search.toString()}` : pathname;
  const languageLabel = locale === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt';
  // Session-dependent destinations use full navigation to avoid a stale guest-prefetched redirect.
  const accountHref = `/${locale}${user ? '/user-profile' : '/auth/signin'}`;
  const accountLabel = user ? t('account') : t('signin');
  return (
    <>
      <header
        className="mu-header store-header"
        ref={header}
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setMenuOpen(false);
        }}
      >
        <div className="mu-wrap store-header-inner">
          <BrandLogo className="store-brand" />
          <nav className="store-primary-nav" aria-label={t('menu')}>
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={link.key === 'offers' ? 'store-offers-link' : undefined}
                aria-current={active(link.href) ? 'page' : undefined}
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
          <div className="store-header-tools">
            <a
              className="store-language"
              href={`/${locale === 'vi' ? 'en' : 'vi'}${switchHref}`}
              aria-label={languageLabel}
              title={languageLabel}
            >
              {locale === 'vi' ? 'EN' : 'VI'}
            </a>
            <span className="store-header-divider" aria-hidden="true" />
            <Link className="store-tool" href="/cua-hang#filter-q" aria-label={t('search')} title={t('search')}>
              <AdminIcon name="search" size={19} />
            </Link>
            <Link
              className="store-tool store-desktop-action"
              href="/wishlist"
              aria-label={t('saved')}
              title={t('saved')}
              aria-current={active('/wishlist') ? 'page' : undefined}
            >
              <AdminIcon name="heart" size={19} />
            </Link>
            <a
              className="store-account store-desktop-action"
              href={accountHref}
              aria-label={accountLabel}
              title={accountLabel}
            >
              <AdminIcon name="users" size={18} />
              <span>{accountLabel}</span>
            </a>
            <CartDropdown buttonClassName="store-tool store-cart-tool" />
            <button
              className="store-tool store-menu-button"
              ref={menuButton}
              type="button"
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              aria-controls="store-mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <AdminIcon name={menuOpen ? 'close' : 'menu'} size={20} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="store-mobile-menu" className="store-mobile-menu" aria-label={t('menu')}>
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                aria-current={active(link.href) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <span>{t(link.key)}</span>
                <AdminIcon name="arrow" size={16} />
              </Link>
            ))}
            <div className="store-menu-secondary">
              <Link href="/wishlist" onClick={() => setMenuOpen(false)}>
                <AdminIcon name="heart" size={17} />
                {t('saved')}
              </Link>
              <a href={accountHref} onClick={() => setMenuOpen(false)}>
                <AdminIcon name="users" size={17} />
                {accountLabel}
              </a>
            </div>
          </nav>
        )}
      </header>
      <nav className="mu-mobile-nav" aria-label={t('menu')}>
        <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
          <AdminIcon name="dashboard" size={20} />
          {t('home')}
        </Link>
        <Link
          href="/cua-hang"
          aria-label={t('shop')}
          aria-current={pathname.startsWith('/cua-hang') ? 'page' : undefined}
        >
          <AdminIcon name="box" size={20} />
          {t('mobileShop')}
        </Link>
        <Link href="/wishlist" aria-label={t('saved')} aria-current={pathname === '/wishlist' ? 'page' : undefined}>
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
