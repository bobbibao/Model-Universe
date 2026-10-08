'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import Link from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import ProductApi from '@/core/client/api/Product';
import Api from '@/core/client/api/Api';
import WishlistApi from '@/core/client/api/Wishlist';
import { useCart } from '@/shared/client/providers/CartProvider';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import type { WishlistItem } from '@/shared/types/cart';
import PriceTag from '@/components/PriceTag';
import type { ProductDetail as ProductDetailType } from '@/shared/types/product';
import ProductGallery from '../components/ProductGallery';
import ProductReviews from '../components/ProductReviews';
import RatingStars from '../components/RatingStars';
import { trackAddToCart, trackViewContent } from '@/shared/client/utils/tracking';


const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-md bg-gray-2 px-4 py-3 dark:bg-store-card">
    <p className="text-sm text-body dark:text-store-muted">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
);

const ProductDetail = () => {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const [product, setProduct] = useState<ProductDetailType | null>();
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [reserveBusy, setReserveBusy] = useState(false);
  const reservationRequest = useRef<{ key: string; quantity: number }>();
  const router = useRouter();
  const { addItem } = useCart();
  const { user } = useCurrentUser();
  const agent = useCustomerAssistant();

  const loadProduct = useCallback(
    async (resetSelection: boolean) => {
      if (!Number.isInteger(productId) || productId <= 0) {
        setProduct(null);
        return;
      }
      const result = await ProductApi.getProduct(productId);
      setProduct(result ?? null);
      if (result && resetSelection) {
        trackViewContent({ id: String(result.id), name: result.name, price: result.salePrice, quantity: 1 });
      }
      if (resetSelection) {
        setSize(result?.availableSizes[0] || '');
        setQuantity(1);
      }
    },
    [productId],
  );

  useEffect(() => {
    loadProduct(true);
  }, [loadProduct]);

  useEffect(() => {
    if (user) WishlistApi.getWishlist().then((items) => setWishlist(items || []));
    else setWishlist([]);
  }, [user]);
  const refreshAssistantChanges = useCallback(() => {
    void loadProduct(false);
    if (user) WishlistApi.getWishlist().then((items) => setWishlist(items || []));
  }, [loadProduct, user]);
  useCustomerActionRefresh('wishlist_add,wishlist_remove,review', refreshAssistantChanges);

  const wishlistItem = wishlist.find((item) => item.productId === productId && item.size === size);

  const toggleWishlist = async () => {
    if (!user) {
      router.push(`/auth/signin?redirect=${encodeURIComponent(`/shop/product/${productId}`)}`);
      return;
    }
    setWishlistBusy(true);
    if (wishlistItem) {
      if (await WishlistApi.removeItem(wishlistItem.id)) {
        setWishlist(wishlist.filter((item) => item.id !== wishlistItem.id));
      }
    } else {
      const added = await WishlistApi.addItem(productId, size);
      if (added) setWishlist([...wishlist, { ...added } as WishlistItem]);
    }
    setWishlistBusy(false);
  };

  if (product === undefined) {
    return (
      <div className="flex justify-center py-32">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (product === null) {
    return (
      <div className="py-32 text-center">
        <p className="mb-4 text-xl">{t('notFound')}</p>
        <Link href="/shop" className="font-medium text-brand-hover hover:underline">
          {t('backToShop')}
        </Link>
      </div>
    );
  }

  const inStock = product.stock > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <nav className="mb-6 text-sm text-body dark:text-store-muted">
        <Link href="/shop" className="hover:text-brand-hover">
          {t('title')}
        </Link>
        {product.category && (
          <>
            {' / '}
            <Link href={`/shop?category=${product.category.slug}`} className="hover:text-brand-hover">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <ProductGallery images={[product.imageUrl, ...product.images]} alt={product.name} />
          {!!product.imageAttributions?.length && <details className="mt-4 text-xs text-body"><summary className="cursor-pointer">{t('imageCredits')}</summary>{product.imageAttributions.map(credit => <p className="mt-2" key={credit.imageUrl}><a href={credit.source} target="_blank" rel="noreferrer" className="underline">{credit.creator}</a> · <a href={credit.licenseUrl} target="_blank" rel="noreferrer" className="underline">{credit.license}</a> · WebP</p>)}</details>}
        </div>

        <div className="flex flex-col gap-5">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <div className="flex items-center gap-2 text-body dark:text-store-muted">
            {product.reviewCount > 0 ? (
              <>
                <RatingStars rating={product.rating} />
                <span>{t('reviewCount', {count:product.reviewCount})}</span>
              </>
            ) : (
              <span>{t('noReviews')}</span>
            )}
          </div>
          <p>
            <PriceTag
              price={product.price}
              salePrice={product.salePrice}
              discountPercent={product.discountPercent}
              className="text-3xl"
            />
            {product.discountEndsAt && (
              <span className="mt-1 block text-sm text-body dark:text-store-muted">
                {t('offerUntil')} {new Date(product.discountEndsAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}
              </span>
            )}
          </p>
          <p className="whitespace-pre-line leading-relaxed">{(locale === 'vi' ? product.descriptionVi : product.descriptionEn) || product.description}</p>
          <button
            onClick={() =>
              agent.open(
                t('assistantPrompt', {id:product.id,name:product.name}),
                true,
              )
            }
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-hover/25 bg-brand/10 px-4 py-4 text-left hover:bg-brand/20"
          >
            <span>
              <strong className="block text-sm">✦ {t('askAssistant')}</strong>
              <span className="mt-1 block text-xs text-body dark:text-store-muted">
                {t('assistantNote')}
              </span>
            </span>
            <span aria-hidden="true">↗</span>
          </button>

          {product.availableSizes.length > 0 && (
            <div>
              <label htmlFor="product-size" className="mb-2 block font-medium">
                {t('legacySize')}
              </label>
              <select
                id="product-size"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="w-40 rounded border-[1.5px] border-stroke bg-transparent px-4 py-2.5 outline-none focus:border-brand-hover dark:border-store-card dark:bg-store-panel"
              >
                {product.availableSizes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span className="mb-2 block font-medium">{t('quantity')}</span>
            <div className="flex w-40 items-center rounded border-[1.5px] border-stroke dark:border-store-card">
              <button
                className="px-4 py-2 text-lg disabled:opacity-40"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label={t('decrease')}
              >
                −
              </button>
              <span className="flex-1 text-center font-semibold">{quantity}</span>
              <button
                className="px-4 py-2 text-lg disabled:opacity-40"
                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                disabled={quantity >= product.stock}
                aria-label={t('increase')}
              >
                +
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={!inStock}
              onClick={() => {
                if (addItem(product, size, quantity)) {
                  trackAddToCart({ id: String(product.id), name: product.name, price: product.salePrice, quantity });
                }
              }}
              className="flex-1 rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inStock ? t('addToCart') : t('soldOut')}
            </button>
            <button
              onClick={toggleWishlist}
              disabled={wishlistBusy}
              className="rounded-md bg-gray px-6 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-60 dark:bg-store-card dark:text-store-text"
            >
              {wishlistItem ? t('unsave') : t('save')}
            </button>
          </div>

          {product.grade && <button disabled={!inStock || reserveBusy} className="mu-button w-full disabled:opacity-50" onClick={async () => {
            if (!user) { router.push(`/auth/signin?redirect=${encodeURIComponent(`/shop/product/${productId}`)}`); return; }
            if (reservationRequest.current?.quantity !== quantity) reservationRequest.current = { key: crypto.randomUUID(), quantity };
            setReserveBusy(true);
            try { await Api.post('/reservations', { productId, quantity, expectedTotal: product.salePrice * quantity, requestKey: reservationRequest.current.key }); router.push('/reservations'); }
            catch { /* The shared API reports policy gates and stale quotes. */ }
            finally { setReserveBusy(false); }
          }}>{t('reserve')}</button>}
          <div className="rounded-lg border border-stroke p-5"><h2 className="font-bold">{t('details')}</h2><p className="mu-note">{t('accessories')}: {(product.includedAccessories || []).join(', ') || t('inspectionRequired')}</p><p className="mu-note">{t('defects')}: {(product.defects || []).join(', ') || t('inspectionRequired')}</p><p className="mu-note">{t('unboxing')}</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoItem label={t('brand')} value={product.brandName} />
            <InfoItem label={t('grade')} value={product.grade || '—'} /><InfoItem label={t('scale')} value={product.scale || '—'} /><InfoItem label={t('series')} value={product.series || '—'} /><InfoItem label={t('condition')} value={t(product.condition === 'preowned' ? 'preowned' : 'new')} /><InfoItem label={t('assembly')} value={product.assemblyState ? t(product.assemblyState) : '—'} /><InfoItem label={t('box')} value={product.boxCondition || '—'} />
            <InfoItem
              label={t('availability')}
              value={
                inStock ? (
                  <span className="text-success">{t('availableCount',{count:product.stock})}</span>
                ) : (
                  <span className="text-danger">{t('soldOut')}</span>
                )
              }
            />
            <InfoItem label="SKU" value={product.sku} />
            <InfoItem label={t('category')} value={product.category?.name || '—'} />
            <InfoItem
              label={t('receivedDate')}
              value={product.productionDate ? new Date(product.productionDate).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB') : '—'}
            />
          </div>
        </div>
      </div>

      <ProductReviews
        productId={product.id}
        rating={product.rating}
        reviewCount={product.reviewCount}
        distribution={product.ratingDistribution}
        onReviewSubmitted={() => loadProduct(false)}
      />
    </div>
  );
};

export default ProductDetail;
