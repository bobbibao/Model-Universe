'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Link, { usePathname } from '@/i18n/navigation';
import BrandLogo from '@/components/BrandLogo';
import CartDropdown from './CartDropdown';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import { useComparison } from '@/shared/client/providers/ComparisonProvider';

export default function StoreHeader() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useCurrentUser();
  const assistant = useCustomerAssistant();
  const comparison = useComparison();
  const links = [
    { key: 'shop', href: '/shop' },
    { key: 'arrivals', href: '/shop?sort=newest' },
    { key: 'services', href: '/services' },
    { key: 'assistant', href: '/assistant' },
    { key: 'compare', href: '/compare' },
  ];
  const switchHref = search.size ? `${pathname}?${search.toString()}` : pathname;
  return <>
    <header className="mu-header">
      <div className="mu-wrap mu-nav">
        <BrandLogo className="text-white [&>span]:text-lg [&>svg]:text-brand sm:[&>span]:text-xl" />
        <nav className="mu-links" aria-label={t('menu')}>
          {links.map(link => <Link key={link.key} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{t(link.key)}{link.key === 'compare' && comparison.ids.length > 0 && ` (${comparison.ids.length})`}</Link>)}
        </nav>
        <div className="mu-actions">
          <Link href={switchHref} locale={locale === 'vi' ? 'en' : 'vi'} aria-label={locale === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'} className="font-bold">{locale === 'vi' ? 'EN' : 'VI'}</Link>
          <Link href="/search" className="mu-hide-mobile" aria-label={t('search')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>
          </Link>
          <Link href={user ? '/user-profile' : '/auth/signin'} className="mu-hide-mobile">{user ? t('account') : t('signin')}</Link>
          <CartDropdown buttonClassName="flex h-10 w-10 items-center justify-center text-white" />
          <button className="xl:hidden" aria-label={t('menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
        </div>
      </div>
      {menuOpen && <nav className="mu-wrap flex flex-col gap-5 pb-6 xl:hidden">
        {[...links, { key: 'saved', href: '/wishlist' }, { key: 'account', href: user ? '/user-profile' : '/auth/signin' }].map(link => <Link key={link.key} href={link.href} onClick={() => setMenuOpen(false)}>{t(link.key)}{link.key === 'compare' && comparison.ids.length > 0 && ` (${comparison.ids.length})`}</Link>)}
      </nav>}
    </header>
    <nav className="mu-mobile-nav" aria-label={t('menu')}>
      <Link href="/">◈ {t('home')}</Link><Link href="/shop">▦ {t('shop')}</Link>
      <button onClick={() => assistant.open()}>✦ {t('assistant')}</button>
      <Link href={user ? '/user-profile' : '/auth/signin'}>◎ {t('account')}</Link>
    </nav>
  </>;
}
