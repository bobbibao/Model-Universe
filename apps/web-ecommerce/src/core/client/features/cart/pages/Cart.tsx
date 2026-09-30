'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import OrderApi from '@/core/client/api/Order';
import { useCart } from '@/shared/client/providers/CartProvider';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { formatVND } from '@/shared/server/utils/utils';
import type { CouponPreview, ShippingInfo } from '@/shared/types/order';
import CartLineItem from '../components/CartLineItem';
import CouponBox from '../components/CouponBox';
import CheckoutForm, { ShippingErrors, validateShipping } from '../components/CheckoutForm';

const emptyShipping: ShippingInfo = {
  recipientName: '',
  phone: '',
  address: '',
  ward: '',
  district: '',
  city: '',
  note: '',
};

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div
    className={`flex justify-between py-2 ${strong ? 'border-t border-stroke pt-3 text-lg font-bold dark:border-store-card' : ''}`}
  >
    <span>{label}</span>
    <span className={strong ? 'text-danger' : ''}>{value}</span>
  </div>
);

const Cart = () => {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { entries, count, subtotal, hasIssues, quoting, removeUnavailable, clearCart, refreshQuote } = useCart();
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [shipping, setShipping] = useState<ShippingInfo>(emptyShipping);
  const [shippingErrors, setShippingErrors] = useState<ShippingErrors>({});
  const [confirming, setConfirming] = useState(false);

  // Pre-fill the shipping details from the profile once the user is known.
  useEffect(() => {
    if (user) {
      setShipping((current) => ({
        ...current,
        recipientName: current.recipientName || `${user.lastName} ${user.firstName}`.trim(),
        phone: current.phone || user.phone || '',
        address: current.address || user.address || '',
      }));
    }
  }, [user]);

  // A coupon with a minimum order stops applying when the cart drops below it (checkout checks it again).
  useEffect(() => {
    if (coupon && subtotal < coupon.minOrderVnd) {
      setCoupon(null);
      toast.info(`Mã ${coupon.code} áp dụng cho đơn hàng từ ${formatVND(coupon.minOrderVnd)}.`);
    }
  }, [coupon, subtotal]);

  const discount = coupon ? Math.round((subtotal * coupon.discountPercent) / 100) : 0;
  const total = subtotal - discount;
  const hasRemovable = entries.some(
    ({ line }) => line && ['UNAVAILABLE', 'OUT_OF_STOCK', 'INVALID_SIZE'].includes(line.status),
  );

  const startCheckout = () => {
    const errors = validateShipping(shipping);
    setShippingErrors(errors);
    if (Object.keys(errors).length === 0) setConfirming(true);
  };

  const placeOrder = async () => {
    const order = await OrderApi.placeOrder({
      items: entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })),
      shipping,
      couponCode: coupon?.code,
    });
    setConfirming(false);
    if (order) {
      clearCart();
      router.push(`/thank-you?orderId=${order.id}`);
    } else {
      // Stock or prices may have changed: refresh the cart check.
      refreshQuote();
    }
  };

  if (count === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h1 className="mb-4 text-3xl font-bold">Giỏ hàng</h1>
        <p className="mb-6 text-body dark:text-store-muted">Giỏ hàng đang trống.</p>
        <Link href="/shop" className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover">
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Giỏ hàng ({count} sản phẩm)</h1>
      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hasIssues && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger bg-danger/10 px-4 py-3 text-danger">
              <span>Một số sản phẩm trong giỏ không còn hợp lệ. Vui lòng điều chỉnh trước khi đặt hàng.</span>
              {hasRemovable && (
                <button onClick={removeUnavailable} className="font-semibold underline">
                  Xoá các sản phẩm không còn bán
                </button>
              )}
            </div>
          )}
          {entries.map((entry) => (
            <CartLineItem key={`${entry.item.productId}-${entry.item.size}`} entry={entry} />
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-md border border-stroke p-5 dark:border-store-card">
            <h2 className="mb-3 text-lg font-semibold">Mã giảm giá</h2>
            <CouponBox coupon={coupon} onChange={setCoupon} loggedIn={!!user} subtotal={subtotal} />
          </section>

          <section className="rounded-md border border-stroke p-5 dark:border-store-card">
            <SummaryRow label="Tổng tiền hàng" value={formatVND(subtotal)} />
            <SummaryRow label="Phí giao hàng" value="Miễn phí" />
            <SummaryRow label="Giảm giá" value={discount > 0 ? `-${formatVND(discount)}` : 'Chưa áp dụng'} />
            <SummaryRow label="Tổng tiền cần thanh toán" value={formatVND(total)} strong />
          </section>

          {user ? (
            <section className="flex flex-col gap-5 rounded-md border border-stroke p-5 dark:border-store-card">
              <h2 className="text-lg font-semibold">Thông tin giao hàng</h2>
              <CheckoutForm shipping={shipping} errors={shippingErrors} onChange={setShipping} />
              <div>
                <h3 className="mb-2 font-semibold">Phương thức thanh toán</h3>
                <label className="flex items-center gap-3">
                  <input type="radio" checked readOnly className="h-4 w-4 accent-brand-hover" />
                  Thanh toán khi nhận hàng (COD)
                </label>
              </div>
              <button
                onClick={startCheckout}
                disabled={hasIssues || quoting}
                className="rounded-md bg-brand px-6 py-3 text-lg font-semibold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                Đặt hàng ngay
              </button>
            </section>
          ) : (
            <Link
              href="/auth/signin?redirect=/cart"
              className="rounded-md bg-brand px-6 py-3 text-center text-lg font-semibold text-brand-ink hover:bg-brand-hover"
            >
              Đăng nhập để đặt hàng
            </Link>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        title="Xác nhận đặt hàng"
        message={
          <>
            Đặt {count} sản phẩm với tổng thanh toán <strong>{formatVND(total)}</strong>, giao tới{' '}
            <strong>
              {[shipping.address, shipping.ward, shipping.district, shipping.city].filter(Boolean).join(', ')}
            </strong>
            ?
          </>
        }
        confirmLabel="Đặt hàng"
        onConfirm={placeOrder}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
};

export default Cart;
