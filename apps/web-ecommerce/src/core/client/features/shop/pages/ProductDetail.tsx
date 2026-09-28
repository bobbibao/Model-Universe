'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ProductApi from '@/core/client/api/Product';
import WishlistApi from '@/core/client/api/Wishlist';
import { useCart } from '@/shared/client/providers/CartProvider';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { WishlistItem } from '@/shared/types/cart';
import { formatVND } from '@/shared/server/utils/utils';
import type { ProductDetail as ProductDetailType } from '@/shared/types/product';
import ProductGallery from '../components/ProductGallery';
import ProductReviews from '../components/ProductReviews';
import RatingStars from '../components/RatingStars';

const GENDER_LABELS = { male: 'Nam', female: 'Nữ', unisex: 'Unisex' };

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-md bg-gray-2 px-4 py-3 dark:bg-store-card">
    <p className="text-sm text-body dark:text-store-muted">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
);

const ProductDetail = () => {
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const [product, setProduct] = useState<ProductDetailType | null>();
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const router = useRouter();
  const { addItem } = useCart();
  const { user } = useCurrentUser();

  const loadProduct = useCallback(
    async (resetSelection: boolean) => {
      if (!Number.isInteger(productId) || productId <= 0) {
        setProduct(null);
        return;
      }
      const result = await ProductApi.getProduct(productId);
      setProduct(result ?? null);
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
        <p className="mb-4 text-xl">Không tìm thấy sản phẩm.</p>
        <Link href="/shop" className="font-medium text-brand-hover hover:underline">
          Quay lại cửa hàng
        </Link>
      </div>
    );
  }

  const inStock = product.stock > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <nav className="mb-6 text-sm text-body dark:text-store-muted">
        <Link href="/shop" className="hover:text-brand-hover">
          Sản phẩm
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
        <ProductGallery images={[product.imageUrl, ...product.images]} alt={product.name} />

        <div className="flex flex-col gap-5">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <div className="flex items-center gap-2 text-body dark:text-store-muted">
            {product.reviewCount > 0 ? (
              <>
                <RatingStars rating={product.rating} />
                <span>({product.reviewCount} đánh giá)</span>
              </>
            ) : (
              <span>Chưa có đánh giá</span>
            )}
          </div>
          <p className="text-3xl font-bold text-danger">{formatVND(product.price)}</p>
          {product.description && <p className="whitespace-pre-line leading-relaxed">{product.description}</p>}

          {product.availableSizes.length > 0 && (
            <div>
              <label htmlFor="product-size" className="mb-2 block font-medium">
                Kích thước
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
            <span className="mb-2 block font-medium">Số lượng</span>
            <div className="flex w-40 items-center rounded border-[1.5px] border-stroke dark:border-store-card">
              <button
                className="px-4 py-2 text-lg disabled:opacity-40"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="Giảm số lượng"
              >
                −
              </button>
              <span className="flex-1 text-center font-semibold">{quantity}</span>
              <button
                className="px-4 py-2 text-lg disabled:opacity-40"
                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                disabled={quantity >= product.stock}
                aria-label="Tăng số lượng"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={!inStock}
              onClick={() => addItem(product, size, quantity)}
              className="flex-1 rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inStock ? 'Thêm vào giỏ hàng' : 'Hết hàng'}
            </button>
            <button
              onClick={toggleWishlist}
              disabled={wishlistBusy}
              className="rounded-md bg-gray px-6 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-60 dark:bg-store-card dark:text-store-text"
            >
              {wishlistItem ? '♥ Xoá khỏi yêu thích' : '♡ Thêm vào yêu thích'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoItem label="Thương hiệu" value={product.brandName} />
            <InfoItem label="Giới tính" value={GENDER_LABELS[product.gender]} />
            <InfoItem
              label="Tình trạng"
              value={
                inStock ? (
                  <span className="text-success">Còn hàng ({product.stock})</span>
                ) : (
                  <span className="text-danger">Hết hàng</span>
                )
              }
            />
            <InfoItem label="SKU" value={product.sku} />
            <InfoItem label="Loại sản phẩm" value={product.category?.name || '—'} />
            <InfoItem
              label="Ngày nhập"
              value={product.productionDate ? new Date(product.productionDate).toLocaleDateString('vi-VN') : '—'}
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
