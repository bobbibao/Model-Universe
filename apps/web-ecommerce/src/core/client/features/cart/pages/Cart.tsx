'use client';

import { useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

import { toast } from 'react-toastify';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import OrderApi from '@/core/client/api/Order';
import CartApi from '@/core/client/api/Cart';
import Api from '@/core/client/api/Api';
import type { LoyaltyOverview } from '@/shared/types/loyalty';
import type { CartQuote } from '@/shared/types/cart';
import { useCart } from '@/shared/client/providers/CartProvider';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { formatVND } from '@/shared/server/utils/utils';
import CartLineItem from '../components/CartLineItem';
import CouponBox from '../components/CouponBox';
import CheckoutForm, { ShippingErrors, validateShipping } from '../components/CheckoutForm';

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div
    className={`flex justify-between py-2 ${strong ? 'border-t border-stroke pt-3 text-lg font-bold dark:border-store-card' : ''}`}
  >
    <span>{label}</span>
    <span className={strong ? 'text-brand-hover' : ''}>{value}</span>
  </div>
);

const Cart = () => {
  const t = useTranslations('checkout'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const router = useRouter();
  const { user } = useCurrentUser();
  const { entries, count, subtotal, hasIssues, quoting, removeUnavailable, clearCart, refreshQuote } = useCart();
  const { coupon, setCoupon, shipping, setShipping, useMemberDiscount, setUseMemberDiscount } = useCheckoutDraft();
  const [shippingErrors, setShippingErrors] = useState<ShippingErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [memberEligible, setMemberEligible] = useState(false);
  useEffect(() => {
    setMemberEligible(false);
    if (!user) return;
    let active = true;
    void Api.get('/loyalty')
      .then((response: {data:LoyaltyOverview}) => {
        const value = response.data as LoyaltyOverview;
        if (active) setMemberEligible(value.active && value.balances.tier.discountPercent > 0);
      })
      .catch(() => {
        /* A failed eligibility read does not enable a financial benefit. */
      });
    return () => {
      active = false;
    };
  }, [user]);
  const [couponQuote, setCouponQuote] = useState<{ signature: string; quote: CartQuote }>();
  const checkoutSignature = JSON.stringify({
    items: entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })),
    code: coupon?.code,
    useMemberDiscount,
  });
  useEffect(() => {
    if (!coupon && !useMemberDiscount) {
      setCouponQuote(undefined);
      return;
    }
    let cancelled = false;
    const request = JSON.parse(checkoutSignature) as {
      items: { productId: number; size: string; quantity: number }[];
      code: string;
      useMemberDiscount: boolean;
    };
    void CartApi.getQuote(request.items, request.code, request.useMemberDiscount).then((quote) => {
      if (cancelled) return;
      if (quote) setCouponQuote({ signature: checkoutSignature, quote });
      else {
        setCoupon(null);
        setUseMemberDiscount(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkoutSignature, coupon, setCoupon, useMemberDiscount, setUseMemberDiscount]);

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
  }, [user, setShipping]);

  // A coupon with a minimum order stops applying when the cart drops below it (checkout checks it again).
  useEffect(() => {
    if (coupon && subtotal < coupon.minOrderVnd) {
      setCoupon(null);
      toast.info(t('couponMinimum', { code: coupon.code, amount: money(coupon.minOrderVnd) }));
    }
  }, [coupon, subtotal, setCoupon, t, locale]);

  const checkedQuote = couponQuote?.signature === checkoutSignature ? couponQuote.quote : undefined;
  const couponPending = (!!coupon || useMemberDiscount) && !checkedQuote;
  const discount = checkedQuote?.discount ?? 0;
  const total = checkedQuote?.total ?? subtotal;
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
      useMemberDiscount,
      expectedTotal: total,
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
        <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
        <p className="mb-6 text-body dark:text-store-muted">{t('empty')}</p>
        <Link href="/shop" className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover">
          {t('continue')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mu-wrap py-10">
      <h1 className="mb-6 text-3xl font-bold">{t('count', { count })}</h1>
      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hasIssues && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger bg-danger/10 px-4 py-3 text-danger">
              <span>{t('issues')}</span>
              {hasRemovable && (
                <button onClick={removeUnavailable} className="font-semibold underline">
                  {t('removeUnavailable')}
                </button>
              )}
            </div>
          )}
          {entries.map((entry) => (
            <CartLineItem key={`${entry.item.productId}-${entry.item.size}`} entry={entry} />
          ))}
          {user && (
            <section id="checkout" className="mt-8 flex scroll-mt-28 flex-col gap-5 mu-panel p-5">
              <h2 className="text-lg font-semibold">{t('shippingTitle')}</h2>
              <CheckoutForm shipping={shipping} errors={shippingErrors} onChange={setShipping} />
              <div>
                <h3 className="mb-2 font-semibold">{t('paymentMethod')}</h3>
                <label className="flex items-center gap-3">
                  <input type="radio" checked readOnly className="h-4 w-4 accent-brand-hover" />
                  {t('cod')}
                </label>
              </div>
              <button
                onClick={startCheckout}
                disabled={hasIssues || quoting || couponPending}
                className="rounded-md bg-brand px-6 py-3 text-lg font-semibold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('placeNow')}
              </button>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <section className="mu-panel p-5">
            <h2 className="mb-3 text-lg font-semibold">{t('couponTitle')}</h2>
            <CouponBox
              coupon={coupon}
              onChange={(value) => {
                setCoupon(value);
                if (value) setUseMemberDiscount(false);
              }}
              loggedIn={!!user}
              subtotal={subtotal}
            />
            {memberEligible && (
              <label className="mt-4 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useMemberDiscount}
                  onChange={(event) => {
                    setUseMemberDiscount(event.target.checked);
                    if (event.target.checked) setCoupon(null);
                  }}
                />
                {t('memberBenefit')}
              </label>
            )}
            <Link href="/services/loyalty" className="mu-note mt-3 inline-block underline">
              {t('memberWallet')}
            </Link>
          </section>

          <section className="mu-panel p-5">
            <SummaryRow label={t('subtotal')} value={money(subtotal)} />
            <SummaryRow label={t('shippingFee')} value={t('free')} />
            <SummaryRow label={t('discount')} value={discount > 0 ? `-${money(discount)}` : t('noDiscount')} />
            <SummaryRow label={t('total')} value={money(total)} strong />
          </section>

          {!user && (
            <Link
              href="/auth/signin?redirect=/cart"
              className="rounded-md bg-brand px-6 py-3 text-center text-lg font-semibold text-brand-ink hover:bg-brand-hover"
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        title={t('confirmTitle')}
        message={t('confirmMessage', {
          count,
          total: money(total),
          address: [shipping.address, shipping.ward, shipping.district, shipping.city].filter(Boolean).join(', '),
        })}
        confirmLabel={t('confirm')}
        onConfirm={placeOrder}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
};

export default Cart;
