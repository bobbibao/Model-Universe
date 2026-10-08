'use client';

import { useLocale } from 'next-intl';
import { formatVND } from '@/shared/server/utils/utils';

interface PriceTagProps {
  price: number;
  salePrice?: number;
  discountPercent?: number;
  className?: string;
}

// Selling price; during a discount also the struck-through list price and the percentage.
const PriceTag = ({ price, salePrice, discountPercent = 0, className = 'text-lg' }: PriceTagProps) => {
  const locale = useLocale();
  const discounted = discountPercent > 0 && salePrice !== undefined && salePrice < price;
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-2 ${className}`}>
      <span className="font-bold text-danger">{formatVND(discounted ? (salePrice as number) : price,locale)}</span>
      {discounted && (
        <>
          <span className="text-[0.75em] text-body line-through dark:text-store-muted">{formatVND(price,locale)}</span>
          <span className="rounded bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">
            -{Math.round(discountPercent)}%
          </span>
        </>
      )}
    </span>
  );
};

export default PriceTag;
