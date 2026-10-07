'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function CheckoutAction({ action, onDone }: { action: CustomerAction; onDone: () => void }) {
  const cart = useCart();
  const draft = useCheckoutDraft();
  const { recordAction, close } = useCustomerAssistant();
  const router = useRouter();
  const [shipping, setShipping] = useState(() => ({ ...draft.shipping, ...action.shipping }));
  const [errors, setErrors] = useState<ShippingErrors>({});
  const [preview, setPreview] = useState<{ quote: CartQuote; total: number; signature: string; couponCode?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const items = cart.entries.map(({ item }) => ({
    productId: item.productId,
    size: item.size,
    quantity: item.quantity,
  }));
  const signature = JSON.stringify({ items, shipping, coupon: draft.coupon?.code });
  const prepared = preview?.signature === signature;
  const submit = async () => {
    if (running.current) return;
    const validation = validateShipping(shipping);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const quote = await CartApi.getQuote(items, draft.coupon?.code);
      if (!quote || !quote.itemCount || quote.hasIssues)
        throw new Error('Giỏ hàng có thay đổi hoặc chưa hợp lệ. Hãy kiểm tra số lượng và kích thước.');
      const total = quote.total ?? quote.subtotal;
      const couponCode = quote.couponCode || undefined;
      const linesChanged = JSON.stringify(quote.lines) !== JSON.stringify(preview?.quote.lines);
      if (!prepared || total !== preview.total || linesChanged) {
        setPreview({ quote, total, signature, couponCode });
        draft.setShipping(shipping);
        if (prepared) setError('Giá hoặc thông tin sản phẩm đã thay đổi. Kiểm tra lại trước khi xác nhận.');
        return;
      }
      const order = await OrderApi.placeOrder({ items, shipping, couponCode, expectedTotal: total });
      if (!order) throw new Error('Chưa nhận được xác nhận đặt hàng. Hãy kiểm tra lịch sử đơn hàng trước khi gửi lại.');
      cart.clearCart();
      draft.setCoupon(null);
      onDone();
      recordAction(
        `Đã đặt đơn #${order.id}, tổng thanh toán ${formatVND(order.total)}. Thanh toán khi nhận hàng (COD).`,
      );
      router.push(`/thank-you?orderId=${order.id}`);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa đặt được đơn hàng.');
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
        <span>THANH TOÁN TRONG CHAT</span>
        <strong>Kiểm tra trước khi đặt hàng</strong>
      </div>
      <CheckoutForm shipping={shipping} errors={errors} onChange={setShipping} />
      <p className="agent-muted">Thanh toán khi nhận hàng (COD) · Giao hàng miễn phí</p>
      {draft.coupon && (
        <p>
          Mã {draft.coupon.code}{' '}
          <button type="button" className="agent-text-button" onClick={() => draft.setCoupon(null)}>
            Bỏ mã
          </button>
        </p>
      )}
      {prepared && (
        <div className="agent-checkout-summary">
          {preview.quote.lines.map((line) => (
            <p key={`${line.productId}-${line.size}`}>
              {line.product?.name}
              {line.size ? ` · ${line.size}` : ''} × {line.quantity}
              <strong>{formatVND(line.lineTotal)}</strong>
            </p>
          ))}
          {preview.couponCode && (
            <p>
              Mã giảm giá<strong>{preview.couponCode}</strong>
            </p>
          )}
          <p className="agent-total">
            Tổng thanh toán<strong>{formatVND(preview.total)}</strong>
          </p>
          <p>
            Giao tới: {[shipping.address, shipping.ward, shipping.district, shipping.city].filter(Boolean).join(', ')}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="agent-error">
          {error}
        </p>
      )}
      <button className="agent-primary" disabled={busy || !cart.count}>
        {busy
          ? 'Đang kiểm tra…'
          : prepared
            ? `Xác nhận đặt hàng · ${formatVND(preview.total)}`
            : 'Kiểm tra giỏ và tổng tiền'}
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
        Mở trang giỏ hàng
      </button>
    </form>
  );
}
