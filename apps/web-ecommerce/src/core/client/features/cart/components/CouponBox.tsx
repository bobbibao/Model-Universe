'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { inputClassName } from '@/components/FormElements/TextField';
import CouponApi from '@/core/client/api/Coupon';
import type { CouponPreview } from '@/shared/types/order';

interface CouponBoxProps {
  coupon: CouponPreview | null;
  onChange: (coupon: CouponPreview | null) => void;
  loggedIn: boolean;
}

const CouponBox = ({ coupon, onChange, loggedIn }: CouponBoxProps) => {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    const result = await CouponApi.validateCoupon(code.trim());
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
          Đăng nhập
        </Link>{' '}
        để sử dụng mã giảm giá.
      </p>
    );
  }

  if (coupon) {
    return (
      <div className="rounded-md border border-dashed border-brand-hover p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-brand-hover">
              {coupon.code} (-{coupon.discountPercent}%)
            </p>
            <p className="text-sm">{coupon.description || coupon.title}</p>
            <p className="text-xs text-body dark:text-store-muted">
              HSD: {new Date(coupon.expirationDate).toLocaleDateString('vi-VN')}
            </p>
          </div>
          <button onClick={() => onChange(null)} className="text-sm font-medium text-danger hover:underline">
            Bỏ mã
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={apply} className="flex gap-2">
      <input
        className={`${inputClassName} !py-2.5 uppercase`}
        placeholder="Nhập mã giảm giá"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <button
        type="submit"
        disabled={checking || !code.trim()}
        className="shrink-0 rounded-md bg-gray px-4 font-semibold text-black hover:opacity-90 disabled:opacity-50 dark:bg-store-card dark:text-store-text"
      >
        {checking ? '...' : 'Áp dụng'}
      </button>
    </form>
  );
};

export default CouponBox;
