'use client';

import Link from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import ProductImage from '@/components/ProductImage';
import { CartEntry, useCart } from '@/shared/client/providers/CartProvider';
import { formatVND } from '@/shared/server/utils/utils';

const CartLineItem = ({ entry }: { entry: CartEntry }) => {
  const t = useTranslations('checkout'), locale = useLocale();
  const { updateQuantity, removeItem } = useCart();
  const { item, line } = entry;
  const product = line?.product;
  const name = product?.name || item.name;
  // The server quote's effective price (after any running discount); the stored snapshot until it arrives.
  const price = product?.salePrice ?? item.price;
  const status = line?.status;
  const unavailable = status === 'UNAVAILABLE' || status === 'OUT_OF_STOCK' || status === 'INVALID_SIZE';
  const maxQuantity = line && line.availableStock > 0 ? line.availableStock : item.quantity;

  return (
    <div className="flex gap-4 border-b border-stroke py-5 dark:border-store-card">
      <Link
        href={`/shop/product/${item.productId}`}
        className={`relative h-24 w-24 shrink-0 overflow-hidden rounded bg-gray-2 dark:bg-store-card ${unavailable ? 'opacity-50' : ''}`}
      >
        <ProductImage src={product?.imageUrl || item.imageUrl} alt={name} sizes="96px" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/shop/product/${item.productId}`} className="font-semibold hover:text-brand-hover">
          {name}
        </Link>
        <p className="text-sm text-body dark:text-store-muted">{t('brand')}: {product?.brandName || item.brandName}</p>
        {item.size && <p className="text-sm text-body dark:text-store-muted">{t('size')}: {item.size}</p>}
        {line && status !== 'OK' && <p className="text-sm font-medium text-danger">{t(`lineStatus.${status}`)}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-4 pt-2">
          <div className="flex items-center rounded border border-stroke dark:border-store-card">
            <button
              className="px-3 py-1 disabled:opacity-40"
              onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
              disabled={item.quantity <= 1 || unavailable}
              aria-label={t('decrease')}
            >
              −
            </button>
            <span className="min-w-8 text-center font-semibold">{item.quantity}</span>
            <button
              className="px-3 py-1 disabled:opacity-40"
              onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
              disabled={item.quantity >= maxQuantity || unavailable}
              aria-label={t('increase')}
            >
              +
            </button>
          </div>
          {status === 'INSUFFICIENT_STOCK' && line && line.availableStock > 0 && (
            <button
              className="text-sm font-medium text-brand-hover hover:underline"
              onClick={() => updateQuantity(item.productId, item.size, Math.min(item.quantity, line.availableStock))}
            >
              {t('reduce',{count:Math.min(item.quantity,line.availableStock)})}
            </button>
          )}
          <button
            className="text-sm font-medium text-danger hover:underline"
            onClick={() => removeItem(item.productId, item.size)}
          >
            {t('remove')}
          </button>
        </div>
      </div>
      <p className={`shrink-0 font-bold ${unavailable ? 'text-body line-through' : ''}`}>
        {formatVND(price * item.quantity,locale)}
      </p>
    </div>
  );
};

export default CartLineItem;
