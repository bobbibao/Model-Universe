'use client';

import { useCallback, useEffect, useState } from 'react';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import Link from '@/i18n/navigation';
import ProductImage from '@/components/ProductImage';
import WishlistApi from '@/core/client/api/Wishlist';
import { useCart } from '@/shared/client/providers/CartProvider';
import { formatVND } from '@/shared/server/utils/utils';
import type { WishlistItem } from '@/shared/types/cart';

const Wishlist = () => {
  const { addItem } = useCart();
  const [items, setItems] = useState<WishlistItem[]>();

  const refresh = useCallback(() => {
    WishlistApi.getWishlist().then((result) => setItems(result || []));
  }, []);
  useEffect(refresh, [refresh]);
  useCustomerActionRefresh('wishlist_add,wishlist_remove', refresh);

  const remove = async (item: WishlistItem) => {
    if (await WishlistApi.removeItem(item.id)) setItems((current) => current?.filter(({ id }) => id !== item.id));
  };

  // Moves the item to the cart (one unit) and removes it from the wishlist.
  const moveToCart = async (item: WishlistItem) => {
    if (addItem(item.product, item.size, 1)) await remove(item);
  };

  if (!items) {
    return (
      <div className="flex justify-center py-32">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Danh sách yêu thích</h1>
      {items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-6 text-body dark:text-store-muted">Danh sách yêu thích đang trống.</p>
          <Link
            href="/shop"
            className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
          >
            Khám phá sản phẩm
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-stroke text-sm text-body dark:border-store-card dark:text-store-muted">
                <th className="py-3 pr-3">#</th>
                <th className="py-3 pr-3">Tên sản phẩm</th>
                <th className="py-3 pr-3">Kích thước</th>
                <th className="py-3 pr-3">Giá</th>
                <th className="py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const soldOut = item.available && item.product.stock <= 0;
                return (
                  <tr key={item.id} className="border-b border-stroke dark:border-store-card">
                    <td className="py-4 pr-3">{index + 1}</td>
                    <td className="py-4 pr-3">
                      <Link
                        href={`/shop/product/${item.productId}`}
                        className={`flex items-center gap-3 hover:text-brand-hover ${item.available ? '' : 'pointer-events-none opacity-60'}`}
                      >
                        <span className="relative h-16 w-14 shrink-0 overflow-hidden rounded bg-gray-2 dark:bg-store-card">
                          <ProductImage src={item.product.imageUrl} alt={item.product.name} sizes="56px" />
                        </span>
                        <span>
                          {item.product.name}
                          {!item.available && (
                            <span className="block text-sm text-danger">Sản phẩm không còn được bán</span>
                          )}
                          {soldOut && <span className="block text-sm text-danger">Hết hàng</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="py-4 pr-3">{item.size || '—'}</td>
                    <td className="py-4 pr-3 font-semibold">{formatVND(item.product.salePrice)}</td>
                    <td className="py-4">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => moveToCart(item)}
                          disabled={!item.available || soldOut}
                          className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Thêm vào giỏ
                        </button>
                        <button
                          onClick={() => remove(item)}
                          className="text-sm font-medium text-danger hover:underline"
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Wishlist;
