'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ClickOutside from '@/components/ClickOutside';
import { useCart } from '@/shared/client/providers/CartProvider';
import { formatVND } from '@/shared/server/utils/utils';

const CartDropdown = ({ buttonClassName }: { buttonClassName: string }) => {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const popupId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const { count, subtotal } = useCart();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  return (
    <ClickOutside onClick={() => setOpen(false)} className="relative">
      <button
        ref={trigger}
        className={`${buttonClassName} relative`}
        onClick={() => setOpen(!open)}
        aria-label={t('cart')}
        aria-expanded={open}
        aria-controls={popupId}
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
        <div
          id={popupId}
          className="store-cart-popover"
          onBlur={(event) => {
            if (event.relatedTarget && !event.currentTarget.parentElement?.contains(event.relatedTarget as Node))
              setOpen(false);
          }}
        >
          <span className="store-cart-kicker">MODEL UNIVERSE / {t('cart')}</span>
          <p className="store-cart-count">{t('bagCount', { count })}</p>
          <p className="store-cart-subtotal">
            <span>{t('subtotal')}</span>
            <strong>{formatVND(subtotal, locale)}</strong>
          </p>
          <Link href="/cart" onClick={() => setOpen(false)} className="mu-button">
            {t('viewBag')}
          </Link>
        </div>
      )}
    </ClickOutside>
  );
};

export default CartDropdown;
