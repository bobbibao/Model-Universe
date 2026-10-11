'use client';

import Link from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import ProductImage from '@/components/ProductImage';
import AdminIcon from '@/components/Admin/AdminIcon';
import { CartEntry, useCart } from '@/shared/client/providers/CartProvider';
import { formatVND } from '@/shared/server/utils/utils';

const CartLineItem = ({ entry }: { entry: CartEntry }) => {
  const t = useTranslations('checkout'),
    locale = useLocale();
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
    <article className={`cart-line-item ${unavailable ? 'is-unavailable' : ''}`}>
      <Link href={`/shop/product/${item.productId}`} className="cart-line-photo">
        <ProductImage src={product?.imageUrl || item.imageUrl} alt={name} sizes="88px" className="object-contain" />
      </Link>
      <div className="cart-line-copy">
        <Link href={`/shop/product/${item.productId}`} className="cart-line-name">
          {name}
        </Link>
        <p className="cart-line-meta">
          {t('brand')}: {product?.brandName || item.brandName}
        </p>
        {!!product?.partnerId && <p className="text-sm text-brand">{t('partnerItem')}</p>}
        {item.size && (
          <p className="cart-line-meta">
            {t('size')}: {item.size}
          </p>
        )}
        {line && status !== 'OK' && <p className="text-sm font-medium text-danger">{t(`lineStatus.${status}`)}</p>}
        <div className="cart-line-controls">
          <div className="cart-quantity">
            <button
              className="cart-quantity-button"
              onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
              disabled={item.quantity <= 1 || unavailable}
              aria-label={t('decrease')}
            >
              −
            </button>
            <output aria-label={t('quantity')}>{item.quantity}</output>
            <button
              className="cart-quantity-button"
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
              {t('reduce', { count: Math.min(item.quantity, line.availableStock) })}
            </button>
          )}
          <button className="cart-line-remove" onClick={() => removeItem(item.productId, item.size)}>
            <AdminIcon name="close" size={14} />
            {t('remove')}
          </button>
        </div>
      </div>
      <div className="cart-line-total">
        <p className={unavailable ? 'line-through' : ''}>{formatVND(price * item.quantity, locale)}</p>
        <span>{t('unitPrice', { price: formatVND(price, locale) })}</span>
      </div>
    </article>
  );
};

export default CartLineItem;
