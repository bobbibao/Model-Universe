'use client';

import { useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

import { toast } from 'react-toastify';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import AdminIcon from '@/components/Admin/AdminIcon';
import WorkspaceHeader from '@/components/Store/WorkspaceHeader';
import EmptyState from '@/components/Store/EmptyState';
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
import PaymentPlanPicker, { useUpfrontPayment } from '../components/PaymentPlanPicker';
import FulfillmentPicker from '../components/FulfillmentPicker';
import VoucherWallet from '../components/VoucherWallet';
import { checkoutShippingEstimateVnd } from '@/shared/fulfillment';

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`cart-summary-row ${strong ? 'is-total' : ''}`}>
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
  const benefitSubtotalVnd = entries
    .filter((entry) => entry.line?.status === 'OK' && !entry.line.product?.partnerId)
    .reduce((sum, entry) => sum + (entry.line?.lineTotal || 0), 0);
  const hasPartnerItems = entries.some((entry) => !!entry.line?.product?.partnerId);
  const {
    coupon,
    setCoupon,
    shipping,
    setShipping,
    useMemberDiscount,
    setUseMemberDiscount,
    fulfillmentMethod,
    meeting,
    shippingFeeOnDelivery,
  } = useCheckoutDraft();
  const fulfillment = useTranslations('fulfillment');
  const estimatedFeeVnd = checkoutShippingEstimateVnd(count);
  const [shippingErrors, setShippingErrors] = useState<ShippingErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [memberEligible, setMemberEligible] = useState(false);
  useEffect(() => {
    setMemberEligible(false);
    if (!user) return;
    let active = true;
    void Api.get('/loyalty')
      .then((response: { data: LoyaltyOverview }) => {
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
    if (coupon && !quoting && entries.every((entry) => !!entry.line) && benefitSubtotalVnd < coupon.minOrderVnd) {
      setCoupon(null);
      toast.info(t('couponMinimum', { code: coupon.code, amount: formatVND(coupon.minOrderVnd, locale) }));
    }
  }, [coupon, benefitSubtotalVnd, quoting, entries, setCoupon, t, locale]);

  const checkedQuote = couponQuote?.signature === checkoutSignature ? couponQuote.quote : undefined;
  const couponPending = (!!coupon || useMemberDiscount) && !checkedQuote;
  const discount = checkedQuote?.discount ?? 0;
  const total = checkedQuote?.total ?? subtotal;
  const { paymentPlan, depositVnd, upfrontVnd, balanceVnd } = useUpfrontPayment(total);
  const hasRemovable = entries.some(
    ({ line }) => line && ['UNAVAILABLE', 'OUT_OF_STOCK', 'INVALID_SIZE'].includes(line.status),
  );

  const startCheckout = () => {
    const errors = validateShipping(shipping);
    setShippingErrors(errors);
    if (fulfillmentMethod === 'DIRECT_MEETING' && !meeting.date) {
      toast.error(fulfillment('meetingDateRequired'));
      return;
    }
    if (Object.keys(errors).length === 0) setConfirming(true);
    else
      requestAnimationFrame(() => {
        const invalid = document.querySelector<HTMLElement>('#checkout [aria-invalid="true"]');
        invalid?.focus();
        (invalid || document.getElementById('checkout'))?.scrollIntoView({
          block: 'center',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
  };

  const placeOrder = async () => {
    const order = await OrderApi.placeOrder({
      items: entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })),
      shipping,
      couponCode: coupon?.code,
      useMemberDiscount,
      expectedTotal: total,
      paymentPlan,
      depositVnd,
      fulfillmentMethod,
      ...(fulfillmentMethod === 'DIRECT_MEETING'
        ? { meeting: { date: meeting.date, slot: meeting.slot } }
        : { shippingFeeOnDelivery }),
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
      <section className="mu-wrap store-workspace cart-workspace">
        <WorkspaceHeader title={t('title')} icon="bag" />
        <EmptyState icon="bag" title={t('emptyTitle')} description={t('empty')}>
          <Link href="/shop" className="mu-button">
            {t('continue')}
            <AdminIcon name="arrow" size={16} />
          </Link>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="mu-wrap store-workspace cart-workspace">
      <WorkspaceHeader
        title={t('count', { count })}
        description={t('bagHint')}
        icon="bag"
        actions={
          <Link href="/shop" className="store-text-link">
            {t('continue')}
            <AdminIcon name="arrow" size={16} />
          </Link>
        }
      />
      <ol className="cart-checkout-steps" aria-label={t('checkoutSteps')}>
        {['stepBag', 'stepDelivery', 'stepReview'].map((step, index) => (
          <li
            key={step}
            aria-current={confirming ? (index === 2 ? 'step' : undefined) : index === 0 ? 'step' : undefined}
          >
            <span>{index + 1}</span>
            {t(step)}
          </li>
        ))}
      </ol>
      <div className="cart-workspace-layout">
        <div className="cart-main">
          <section className="cart-items-panel" aria-label={t('itemsTitle')}>
            <div className="cart-panel-heading">
              <h2>{t('itemsTitle')}</h2>
              <span>{entries.length}</span>
            </div>
            {hasIssues && (
              <div className="cart-issues" role="alert">
                <span>{t('issues')}</span>
                {hasRemovable && <button onClick={removeUnavailable}>{t('removeUnavailable')}</button>}
              </div>
            )}
            {entries.map((entry) => (
              <CartLineItem key={`${entry.item.productId}-${entry.item.size}`} entry={entry} />
            ))}
          </section>
          {user && (
            <section id="checkout" className="cart-delivery">
              <div className="cart-panel-heading">
                <h2>
                  <AdminIcon name="truck" size={18} />
                  {t('shippingTitle')}
                </h2>
              </div>
              <FulfillmentPicker estimatedFeeVnd={estimatedFeeVnd} />
              <p className="payment-plan-note">
                {fulfillment(fulfillmentMethod === 'DIRECT_MEETING' ? 'meetingPlaceHint' : 'recipientHint')}
              </p>
              <CheckoutForm shipping={shipping} errors={shippingErrors} onChange={setShipping} />
              <PaymentPlanPicker total={total} />
            </section>
          )}
        </div>
        <aside className="cart-sidebar" aria-label={t('summaryTitle')}>
          <section className="cart-order-summary" aria-busy={quoting || couponPending}>
            <h2>{t('summaryTitle')}</h2>
            <SummaryRow label={t('subtotal')} value={money(subtotal)} />
            {hasPartnerItems && (
              <p className="cart-summary-note">{t('shopBenefitsOnly', { amount: money(benefitSubtotalVnd) })}</p>
            )}
            <SummaryRow
              label={t('shippingFee')}
              value={
                fulfillmentMethod === 'DIRECT_MEETING'
                  ? fulfillment('meetingFree')
                  : shippingFeeOnDelivery
                    ? fulfillment('feeLater', { amount: money(estimatedFeeVnd) })
                    : t('free')
              }
            />
            <SummaryRow label={t('discount')} value={discount > 0 ? `-${money(discount)}` : t('noDiscount')} />
            <SummaryRow label={t('total')} value={money(total)} strong />
            {user && (
              <>
                <SummaryRow label={t('payment.transferNow')} value={money(upfrontVnd)} />
                <SummaryRow
                  label={t('payment.codLater')}
                  value={balanceVnd > 0 ? money(balanceVnd) : t('payment.nothingLater')}
                />
              </>
            )}
            {user ? (
              <button
                onClick={startCheckout}
                disabled={hasIssues || quoting || couponPending}
                className="mu-button cart-review-button"
              >
                {t('placeNow')}
                <AdminIcon name="arrow" size={17} />
              </button>
            ) : (
              <Link href="/auth/signin?redirect=/cart" className="mu-button cart-review-button">
                {t('signIn')}
                <AdminIcon name="arrow" size={17} />
              </Link>
            )}
            <p className="cart-checkout-note" role="status">
              {quoting || couponPending ? t('quotePending') : t('reviewNote')}
            </p>
          </section>
          <section className="cart-promotion-panel">
            <h2>{t('couponTitle')}</h2>
            <CouponBox
              coupon={coupon}
              onChange={(value) => {
                setCoupon(value);
                if (value) setUseMemberDiscount(false);
              }}
              loggedIn={!!user}
              subtotal={benefitSubtotalVnd}
            />
            {memberEligible && (
              <label className="cart-member-benefit">
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
            {user && (
              <VoucherWallet
                subtotal={benefitSubtotalVnd}
                onApply={(value) => {
                  setCoupon(value);
                  setUseMemberDiscount(false);
                }}
              />
            )}
            <Link href="/services/loyalty" className="store-text-link">
              {t('memberWallet')}
              <AdminIcon name="arrow" size={14} />
            </Link>
          </section>
        </aside>
      </div>
      <ConfirmModal
        open={confirming}
        title={t('confirmTitle')}
        message={`${fulfillment(fulfillmentMethod === 'DIRECT_MEETING' ? 'confirmMeeting' : 'confirmSpx', { date: meeting.date, slot: meeting.slot, fee: money(estimatedFeeVnd) })} ${t(
          'confirmMessage',
          {
            count,
            total: money(total),
            upfront: money(upfrontVnd),
            balance: money(balanceVnd),
            plan: paymentPlan,
            address: [shipping.address, shipping.ward, shipping.district, shipping.city].filter(Boolean).join(', '),
          },
        )}`}
        confirmLabel={t('confirm')}
        onConfirm={placeOrder}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
};

export default Cart;
