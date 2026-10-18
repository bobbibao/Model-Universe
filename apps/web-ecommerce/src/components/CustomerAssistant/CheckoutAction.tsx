'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

import { useCart } from '@/shared/client/providers/CartProvider';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import CheckoutForm, {
  validateShipping,
  type ShippingErrors,
} from '@/core/client/features/cart/components/CheckoutForm';
import CartApi from '@/core/client/api/Cart';
import OrderApi from '@/core/client/api/Order';
import type { CustomerAction } from '@/shared/types/customer-assistant';
import type { CartQuote } from '@/shared/types/cart';
import { formatVND } from '@/shared/server/utils/utils';
import PaymentPlanPicker from '@/core/client/features/cart/components/PaymentPlanPicker';
import { depositForPercent } from '@/shared/payment';
import AddressPicker from '@/components/Address/AddressPicker';
import Api from '@/core/client/api/Api';

export default function CheckoutAction({ action, onDone }: { action: CustomerAction; onDone: () => void }) {
  const t = useTranslations('assistantCheckout'),
    checkout = useTranslations('checkout'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const cart = useCart();
  const draft = useCheckoutDraft();
  const { recordAction, close } = useCustomerAssistant();
  const router = useRouter();
  const [shipping, setShipping] = useState(() => ({ ...draft.shipping, ...action.shipping }));
  const [errors, setErrors] = useState<ShippingErrors>({});
  const [preview, setPreview] = useState<{
    quote: CartQuote;
    total: number;
    feeVnd: number;
    floor: number;
    signature: string;
    couponCode?: string;
  }>();
  const address = draft.deliveryAddress;
  const addressComplete = !!address.provinceId && !!address.wardId && (address.street || '').trim().length >= 4;
  // GHN delivery: the address lines come from the address picker.
  const orderShipping = {
    ...shipping,
    address: address.street || '',
    ward: address.wardName || '',
    district: '',
    city: address.provinceName || '',
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const items = cart.entries.map(({ item }) => ({
    productId: item.productId,
    size: item.size,
    quantity: item.quantity,
  }));
  const signature = JSON.stringify({
    items,
    shipping,
    address,
    coupon: draft.coupon?.code,
    memberBenefit: draft.useMemberDiscount,
    paymentPlan: draft.paymentPlan,
    depositPercent: draft.depositPercent,
  });
  const prepared = preview?.signature === signature;
  const submit = async () => {
    if (running.current) return;
    const validation = validateShipping(orderShipping);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    if (!addressComplete) {
      setError(t('addressRequired'));
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const quote = await CartApi.getQuote(items, draft.coupon?.code, draft.useMemberDiscount);
      if (!quote || !quote.itemCount || quote.hasIssues) throw new Error(t('invalidBag'));
      const fee = (
        await Api.post('/shipping/quote', {
          items,
          address,
          recipientName: shipping.recipientName,
          phone: shipping.phone,
        })
      ).data as { feeVnd: number };
      const config = (await Api.get('/shipping/config').catch(() => ({ data: {} }))).data as {
        onlinePayment?: boolean;
        codLimitVnd?: number;
      };
      const merchandise = quote.total ?? quote.subtotal;
      const total = merchandise + fee.feeVnd;
      // GHN collects at most the shop's COD limit on delivery.
      const floor = typeof config.codLimitVnd === 'number' ? Math.max(0, total - config.codLimitVnd) : 0;
      const couponCode = quote.couponCode || undefined;
      const linesChanged = JSON.stringify(quote.lines) !== JSON.stringify(preview?.quote.lines);
      if (!prepared || total !== preview.total || linesChanged) {
        setPreview({ quote, total, feeVnd: fee.feeVnd, floor, signature, couponCode });
        draft.setShipping(shipping);
        if (prepared) setError(t('quoteChanged'));
        return;
      }
      const order = await OrderApi.placeOrder({
        items,
        shipping: orderShipping,
        couponCode,
        useMemberDiscount: draft.useMemberDiscount,
        expectedTotal: total,
        paymentPlan: draft.paymentPlan,
        depositVnd:
          draft.paymentPlan === 'deposit'
            ? depositForPercent(total, draft.depositPercent, merchandise, floor)
            : undefined,
        fulfillmentMethod: 'COURIER_COD',
        deliveryAddress: address,
      });
      if (!order) throw new Error(checkout('validationOrder'));
      cart.clearCart();
      draft.setCoupon(null);
      draft.setUseMemberDiscount(false);
      onDone();
      recordAction(t('orderRecorded', { id: order.id, total: money(order.total) }));
      const link = config.onlinePayment ? await OrderApi.paymentLink(order.id, locale) : undefined;
      close();
      if (link) window.location.assign(link.checkoutUrl);
      else router.push(`/thank-you?orderId=${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
      setPreview(undefined);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className="agent-action"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="agent-action-heading">
        <span>{t('eyebrow')}</span>
        <strong>{checkout('placeNow')}</strong>
      </div>
      <CheckoutForm
        shipping={shipping}
        errors={errors}
        onChange={setShipping}
        contactOnly
        onAddressSelect={(saved) =>
          draft.setDeliveryAddress({ provinceName: saved.city, wardName: saved.ward, street: saved.address })
        }
      />
      <AddressPicker value={address} onChange={draft.setDeliveryAddress} idPrefix="assistant-address" />
      {draft.coupon && (
        <p>
          {checkout('couponTitle')}: {draft.coupon.code}{' '}
          <button type="button" className="agent-text-button" onClick={() => draft.setCoupon(null)}>
            {checkout('removeCoupon')}
          </button>
        </p>
      )}
      {prepared && (
        <div className="agent-checkout-summary">
          {preview.quote.lines.map((line) => (
            <p key={`${line.productId}-${line.size}`}>
              {line.product?.name}
              {line.size ? ` · ${line.size}` : ''} × {line.quantity}
              <strong>{money(line.lineTotal)}</strong>
            </p>
          ))}
          {preview.couponCode && (
            <p>
              {checkout('couponTitle')}
              <strong>{preview.couponCode}</strong>
            </p>
          )}
          <p>
            {checkout('shippingFee')}
            <strong>{money(preview.feeVnd)}</strong>
          </p>
          <p className="agent-total">
            {checkout('total')}
            <strong>{money(preview.total)}</strong>
          </p>
          <p>
            {checkout('shippingTitle')}:{' '}
            {[orderShipping.address, orderShipping.ward, orderShipping.city].filter(Boolean).join(', ')}
          </p>
        </div>
      )}
      {prepared && (
        <PaymentPlanPicker total={preview.total} basis={preview.total - preview.feeVnd} floor={preview.floor} compact />
      )}
      {error && (
        <p role="alert" className="agent-error">
          {error}
        </p>
      )}
      <button className="agent-primary" disabled={busy || !cart.count}>
        {busy ? t('checking') : prepared ? `${checkout('confirm')} · ${money(preview.total)}` : t('reviewBag')}
      </button>
      <button
        type="button"
        className="agent-text-button"
        onClick={() => {
          draft.setShipping(shipping);
          router.push('/cart#checkout');
          close();
        }}
      >
        {t('openBag')}
      </button>
    </form>
  );
}
