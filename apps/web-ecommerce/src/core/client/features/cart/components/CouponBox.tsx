'use client';

import { FormEvent, useState } from 'react';
import Link from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatVND } from '@/shared/server/utils/utils';
import { inputClassName } from '@/components/FormElements/TextField';
import CouponApi from '@/core/client/api/Coupon';
import type { CouponPreview } from '@/shared/types/order';

interface CouponBoxProps {
  coupon: CouponPreview | null;
  onChange: (coupon: CouponPreview | null) => void;
  loggedIn: boolean;
  subtotal: number;
}

const CouponBox = ({ coupon, onChange, loggedIn, subtotal }: CouponBoxProps) => {
  const t = useTranslations('checkout'), locale = useLocale();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    const result = await CouponApi.validateCoupon(code.trim(), subtotal);
    setChecking(false);
    if (result) {
      onChange(result);
      setCode('');
    }
  };

  if (!loggedIn) {
    return (
      <p className="text-sm text-body dark:text-store-muted">
        <Link href="/auth/signin?redirect=/cart" className="font-medium text-brand-hover hover:underline">
          {t('couponSignIn')}
        </Link>
      </p>
    );
  }

  if (coupon) {
    return (
      <div className="rounded-md border border-dashed border-brand-hover p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-brand-hover">
              {coupon.code} (−{coupon.fixedAmountVnd ? formatVND(coupon.fixedAmountVnd,locale) : `${coupon.discountPercent}%`})
            </p>
            <p className="text-sm">{coupon.description || coupon.title}</p>
            <p className="text-xs text-body dark:text-store-muted">
              {t('couponExpiry')}: {new Date(coupon.expirationDate).toLocaleDateString(locale)}
            </p>
          </div>
          <button onClick={() => onChange(null)} className="text-sm font-medium text-danger hover:underline">
            {t('removeCoupon')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={apply} className="flex gap-2">
      <input
        className={`${inputClassName} !py-2.5 uppercase`}
        aria-label={t('couponTitle')} placeholder={t('couponPlaceholder')}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <button
        type="submit"
        disabled={checking || !code.trim()}
        className="shrink-0 rounded-md bg-gray px-4 font-semibold text-black hover:opacity-90 disabled:opacity-50 dark:bg-store-card dark:text-store-text"
      >
        {checking ? '...' : t('apply')}
      </button>
    </form>
  );
};

export default CouponBox;
