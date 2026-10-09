'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ClickOutside from '@/components/ClickOutside';
import { useCart } from '@/shared/client/providers/CartProvider';
import { formatVND } from '@/shared/server/utils/utils';

const CartDropdown = ({ buttonClassName }: { buttonClassName: string }) => {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const { count, subtotal } = useCart();

  return (
    <ClickOutside onClick={() => setOpen(false)} className="relative">
      <button
        className={`${buttonClassName} relative`}
        onClick={() => setOpen(!open)}
        aria-label={t('cart')}
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-brand-ink">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-9999 mt-3 w-64 rounded-md border border-stroke bg-white p-4 shadow-default dark:border-store-card dark:bg-store-panel">
          <p className="text-lg font-bold text-black dark:text-white">{t('bagCount',{count})}</p>
          <p className="mb-4 text-body dark:text-store-muted">{t('subtotal')}: {formatVND(subtotal)}</p>
          <Link
            href="/cart"
            onClick={() => setOpen(false)}
            className="block rounded-md bg-brand px-4 py-2.5 text-center font-semibold text-brand-ink hover:bg-brand-hover"
          >
            {t('viewBag')}
          </Link>
        </div>
      )}
    </ClickOutside>
  );
};

export default CartDropdown;
