'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MODEL_RETURN_REASONS } from '@/shared/return-rules';
import Link from '@/i18n/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';

import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCart } from '@/shared/client/providers/CartProvider';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { executeCustomerAction } from '@/core/client/features/assistant/executeCustomerAction';
import type { CustomerAction } from '@/shared/types/customer-assistant';
import CheckoutAction from './CheckoutAction';
import { formatVND } from '@/shared/server/utils/utils';

const LABELS: Record<CustomerAction['kind'], string> = {
  navigate: 'Mở trang',
  cart_add: 'Thêm vào giỏ',
  cart_update: 'Cập nhật số lượng',
  cart_remove: 'Xóa khỏi giỏ',
  cart_clear: 'Làm trống giỏ',
  wishlist_add: 'Lưu yêu thích',
  wishlist_remove: 'Bỏ yêu thích',
  apply_coupon: 'Áp dụng mã giảm giá',
  contact: 'Gửi liên hệ',
  review: 'Đăng đánh giá',
  cancel_order: 'Hủy đơn hàng',
  return_request: 'Gửi yêu cầu trả hàng',
  update_profile: 'Cập nhật tài khoản',
  checkout: 'Chuẩn bị thanh toán',
  logout: 'Đăng xuất',
};
const PRIVATE = new Set([
  'wishlist_add',
  'wishlist_remove',
  'apply_coupon',
  'review',
  'cancel_order',
  'return_request',
  'update_profile',
  'checkout',
  'logout',
]);
export default function ActionCard({
  action: original,
  obsolete = false,
}: {
  action: CustomerAction;
  obsolete?: boolean;
}) {
  const returns = useTranslations('returns');
  const { user, loading, refresh } = useCurrentUser();
  const { recordAction, close } = useCustomerAssistant();
  const draft = useCheckoutDraft();
  const cart = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [action, setAction] = useState<CustomerAction>(() => ({
    ...original,
    name: original.name || (user ? `${user.lastName} ${user.firstName}`.trim() : ''),
    email: original.email || user?.email || '',
    phone: original.phone || user?.phone || '',
  }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [honest, setHonest] = useState(false);
  const running = useRef(false);
  const label = LABELS[action.kind];
  const field = (
    key:
      | 'name'
      | 'email'
      | 'phone'
      | 'company'
      | 'message'
      | 'title'
      | 'content'
      | 'firstName'
      | 'lastName'
      | 'address'
      | 'code'
      | 'note',
    caption: string,
    required = false,
    multiline = false,
  ) => (
    <label className="agent-field">
      <span>{caption}</span>
      {multiline ? (
        <textarea
          rows={3}
          maxLength={key === 'message' || key === 'content' ? 2000 : 500}
          minLength={key === 'message' ? 10 : undefined}
          required={required}
          value={action[key] || ''}
          onChange={(e) => setAction({ ...action, [key]: e.target.value })}
        />
      ) : (
        <input
          type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
          required={required}
          maxLength={
            key === 'email' ? 254 : key === 'phone' ? 30 : ['code', 'firstName', 'lastName'].includes(key) ? 80 : 120
          }
          value={action[key] || ''}
          onChange={(e) => setAction({ ...action, [key]: e.target.value })}
        />
      )}
    </label>
  );
  if (done)
    return (
      <div className="agent-action-done" role="status">
        ✓ {label} — đã thực hiện
      </div>
    );
  if (obsolete)
    return <div className="agent-action-done">Đề xuất trước đó · Hãy gửi yêu cầu mới để dùng dữ liệu hiện tại.</div>;
  if (PRIVATE.has(action.kind) && !user)
    return (
      <div className="agent-action">
        <strong>{label}</strong>
        <p>Đăng nhập để Agent hỗ trợ thao tác này.</p>
        <Link className="agent-primary" href={`/auth/signin?redirect=${encodeURIComponent(pathname)}`} onClick={close}>
          Đăng nhập
        </Link>
      </div>
    );
  if (PRIVATE.has(action.kind) && loading)
    return (
      <div className="agent-action" role="status">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  if (action.kind === 'checkout') return <CheckoutAction action={action} onDone={() => setDone(true)} />;
  const submit = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const message = await executeCustomerAction(action, {
        cart,
        push: router.push,
        setCoupon: draft.setCoupon,
        refreshUser: refresh,
      });
      setDone(true);
      recordAction(message);
      if (action.kind === 'navigate') close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thực hiện được thao tác.');
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
        <span>ĐỀ XUẤT THAO TÁC</span>
        <strong>{label}</strong>
      </div>
      {action.product && <p className="agent-action-product">{action.product.name}</p>}
      {action.path && <p className="agent-muted">{action.path}</p>}
      {action.orderId && (
        <p>
          Đơn hàng #{action.orderId}
          {action.orderTotal !== undefined ? ` · ${formatVND(action.orderTotal)}` : ''}
        </p>
      )}
      {action.kind === 'cart_remove' && (
        <p>
          Sản phẩm #{action.productId}
          {action.size ? ` · Size ${action.size}` : ''}
        </p>
      )}
      {action.kind === 'cart_clear' && <p>Xóa tất cả {cart.count} sản phẩm khỏi giỏ hàng hiện tại.</p>}
      {['cart_add', 'cart_update', 'wishlist_add'].includes(action.kind) && action.product && (
        <div className="agent-fields-row">
          {!!action.product.availableSizes.length && (
            <label className="agent-field">
              <span>Kích thước</span>
              <select
                required
                value={action.size || ''}
                onChange={(e) => setAction({ ...action, size: e.target.value })}
              >
                <option value="">Chọn size</option>
                {action.product.availableSizes.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
          )}
          {action.kind !== 'wishlist_add' && (
            <label className="agent-field">
              <span>Số lượng</span>
              <input
                type="number"
                min="1"
                max={Math.min(999, action.product.stock)}
                required
                value={action.quantity || 1}
                onChange={(e) => setAction({ ...action, quantity: Number(e.target.value) })}
              />
            </label>
          )}
        </div>
      )}
      {action.kind === 'apply_coupon' && field('code', 'Mã giảm giá', true)}
      {action.kind === 'contact' && (
        <>
          {field('name', 'Họ tên', true)}
          {field('email', 'Email phản hồi', true)}
          <div className="agent-fields-row">
            {field('phone', 'Điện thoại')}
            {field('company', 'Công ty')}
          </div>
          {field('message', 'Nội dung gửi cửa hàng', true, true)}
        </>
      )}
      {action.kind === 'review' && (
        <>
          <label className="agent-field">
            <span>Đánh giá của bạn</span>
            <select
              required
              value={action.rating || ''}
              onChange={(e) => setAction({ ...action, rating: Number(e.target.value) })}
            >
              <option value="">Chọn số sao</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} sao
                </option>
              ))}
            </select>
          </label>
          {field('title', 'Tiêu đề', true)}
          {field('content', 'Trải nghiệm của bạn', true, true)}
          <label className="agent-check">
            <input type="checkbox" required checked={honest} onChange={(e) => setHonest(e.target.checked)} />
            Nội dung phản ánh trải nghiệm thực tế của tôi.
          </label>
        </>
      )}
      {action.kind === 'update_profile' && (
        <>
          {action.firstName !== undefined && field('firstName', 'Tên', true)}
          {action.lastName !== undefined && field('lastName', 'Họ', true)}
          {action.phone !== undefined && field('phone', 'Điện thoại')}
          {action.address !== undefined && field('address', 'Địa chỉ', false, true)}
        </>
      )}
      {action.kind === 'return_request' && (
        <>
          {action.returnItems?.map((item, index) => {
            const line = action.returnLines?.find((l) => l.orderItemId === item.orderItemId);
            const change = (patch: Partial<typeof item>) =>
              setAction({
                ...action,
                returnItems: action.returnItems!.map((i, n) => (n === index ? { ...i, ...patch } : i)),
              });
            return (
              <div key={item.orderItemId}>
                <p>
                  {line?.name || `Dòng sản phẩm #${item.orderItemId}`}
                  {line?.size ? ` · ${line.size}` : ''}
                </p>
                <div className="agent-fields-row">
                  <label className="agent-field">
                    <span>Số lượng trả</span>
                    <input
                      type="number"
                      min={1}
                      max={line?.maxQuantity || item.quantity}
                      value={item.quantity}
                      required
                      onChange={(e) => change({ quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="agent-field">
                    <span>{returns('reason')}</span>
                    <select
                      value={item.reason}
                      onChange={(e) => change({ reason: e.target.value as typeof item.reason })}
                    >
                      {(item.reason === 'wrong_size'
                        ? ['wrong_size', ...MODEL_RETURN_REASONS]
                        : MODEL_RETURN_REASONS
                      ).map((reason) => (
                        <option key={reason} value={reason}>
                          {returns(`reasons.${reason}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
          {field('note', 'Ghi chú yêu cầu', false, true)}
          <p className="agent-muted">Cửa hàng sẽ kiểm tra yêu cầu trước khi xử lý hoàn tiền.</p>
        </>
      )}
      {action.kind === 'cancel_order' && (
        <p className="agent-muted">Đơn chỉ được hủy khi chưa giao. Hành động này sẽ giải phóng sản phẩm đã đặt.</p>
      )}
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="agent-primary" disabled={busy}>
        {busy ? 'Đang thực hiện…' : label}
      </button>
    </form>
  );
}
