'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import Link from '@/i18n/navigation';
import ProductImage from '@/components/ProductImage';
import PriceTag from '@/components/PriceTag';
import AdminIcon from '@/components/Admin/AdminIcon';
import WorkspaceHeader from '@/components/Store/WorkspaceHeader';
import EmptyState from '@/components/Store/EmptyState';
import WishlistApi from '@/core/client/api/Wishlist';
import { useCart } from '@/shared/client/providers/CartProvider';
import { useComparison } from '@/shared/client/providers/ComparisonProvider';
import type { WishlistItem } from '@/shared/types/cart';

export default function Wishlist() {
  const t = useTranslations('wishlist');
  const catalog = useTranslations('catalog');
  const common = useTranslations('common');
  const { addItem } = useCart();
  const comparison = useComparison();
  const [items, setItems] = useState<WishlistItem[]>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyIds, setBusyIds] = useState<number[]>([]);

  const refresh = useCallback(() => {
    setLoading(true);
    void WishlistApi.getWishlist().then((result) => {
      setFailed(!result);
      if (result) setItems(result);
      setLoading(false);
    });
  }, []);
  useEffect(refresh, [refresh]);
  useCustomerActionRefresh('wishlist_add,wishlist_remove', refresh);

  const act = async (item: WishlistItem, move = false) => {
    if (busyIds.includes(item.id)) return;
    setBusyIds((current) => [...current, item.id]);
    try {
      if (move && !addItem(item.product, item.size, 1)) return;
      if (await WishlistApi.removeItem(item.id)) setItems((current) => current?.filter(({ id }) => id !== item.id));
    } finally {
      setBusyIds((current) => current.filter((id) => id !== item.id));
    }
  };

  return (
    <section className="mu-wrap store-workspace wishlist-workspace">
      <WorkspaceHeader
        title={t('title')}
        icon="heart"
        description={items ? t('count', { count: items.length }) : t('subtitle')}
        actions={
          <Link href="/shop" className="store-text-link">
            {t('explore')}
            <AdminIcon name="arrow" size={16} />
          </Link>
        }
      />
      {failed ? (
        <EmptyState icon="heart" title={common('error')} description={t('loadFailed')}>
          <button className="mu-button" onClick={refresh}>
            {common('retry')}
          </button>
        </EmptyState>
      ) : loading ? (
        <div className="wishlist-grid" aria-busy="true" aria-label={common('loading')}>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="catalog-product-skeleton" aria-hidden="true">
              <div className="catalog-skeleton-photo" />
              <div className="catalog-skeleton-copy">
                <span />
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      ) : !items?.length ? (
        <EmptyState icon="heart" title={t('emptyTitle')} description={t('empty')}>
          <Link href="/shop" className="mu-button">
            {t('explore')}
            <AdminIcon name="arrow" size={16} />
          </Link>
        </EmptyState>
      ) : (
        <div className="wishlist-grid">
          {items.map((item) => {
            const soldOut = item.product.stock <= 0;
            const busy = busyIds.includes(item.id);
            const selected = comparison.ids.includes(item.productId);
            const href = `/shop/product/${item.productId}`;
            return (
              <article className={`wishlist-card ${!item.available ? 'is-unavailable' : ''}`} key={item.id}>
                <div className="wishlist-photo">
                  {item.available ? (
                    <Link href={href} aria-label={item.product.name}>
                      <ProductImage
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="object-contain"
                        sizes="(min-width: 1024px) 280px, 45vw"
                      />
                    </Link>
                  ) : (
                    <ProductImage
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="object-contain"
                      sizes="280px"
                    />
                  )}
                  <button
                    className="wishlist-remove"
                    aria-label={t('removeNamed', { name: item.product.name })}
                    disabled={busy}
                    onClick={() => void act(item)}
                  >
                    <AdminIcon name="close" size={18} />
                  </button>
                  {(!item.available || soldOut) && (
                    <span className="wishlist-availability">{t(item.available ? 'soldOut' : 'unavailable')}</span>
                  )}
                </div>
                <div className="wishlist-card-body">
                  <p className="wishlist-brand">{item.product.brandName}</p>
                  <h2>{item.available ? <Link href={href}>{item.product.name}</Link> : item.product.name}</h2>
                  {item.size && (
                    <p className="wishlist-size">
                      {t('size')}: {item.size}
                    </p>
                  )}
                  <div className="wishlist-price">
                    <PriceTag
                      price={item.product.price}
                      salePrice={item.product.salePrice}
                      discountPercent={item.product.discountPercent}
                    />
                  </div>
                  <button
                    className="mu-button wishlist-move"
                    disabled={busy || !item.available || soldOut}
                    onClick={() => void act(item, true)}
                  >
                    <AdminIcon name="bag" size={17} />
                    {busy ? common('processing') : t('moveToBag')}
                  </button>
                  {item.available && (
                    <button
                      className="wishlist-compare"
                      aria-pressed={selected}
                      disabled={!selected && comparison.ids.length >= 3}
                      onClick={() => comparison.toggle(item.productId)}
                    >
                      <AdminIcon name="exchange" size={14} />
                      {catalog(selected ? 'selectedCompare' : 'addCompare')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
