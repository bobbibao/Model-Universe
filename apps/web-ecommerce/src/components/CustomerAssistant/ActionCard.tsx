'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
  const t = useTranslations('assistantActions'), locale = useLocale();
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
  const label = t(`labels.${action.kind}`);
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
        ✓ {t('done', { label })}
      </div>
    );
  if (obsolete)
    return <div className="agent-action-done">{t('obsolete')}</div>;
  if (PRIVATE.has(action.kind) && !user)
    return (
      <div className="agent-action">
        <strong>{label}</strong>
        <p>{t('signInRequired')}</p>
        <Link className="agent-primary" href={`/auth/signin?redirect=${encodeURIComponent(pathname)}`} onClick={close}>
          {t('signIn')}
        </Link>
      </div>
    );
  if (PRIVATE.has(action.kind) && loading)
    return (
      <div className="agent-action" role="status">
        {t('checkingSession')}
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
        translate: t,
      });
      setDone(true);
      recordAction(message);
      if (action.kind === 'navigate') close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
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
        <strong>{label}</strong>
      </div>
      {action.product && <p className="agent-action-product">{action.product.name}</p>}
      {action.path && <p className="agent-muted">{action.path}</p>}
      {action.orderId && (
        <p>
          {t('order', { id: action.orderId })}
          {action.orderTotal !== undefined ? ` · ${formatVND(action.orderTotal, locale)}` : ''}
        </p>
      )}
      {action.kind === 'cart_remove' && (
        <p>
          {t('product', { id: action.productId! })}
          {action.size ? ` · Size ${action.size}` : ''}
        </p>
      )}
      {action.kind === 'cart_clear' && <p>{t('clearNote', { count: cart.count })}</p>}
      {['cart_add', 'cart_update', 'wishlist_add'].includes(action.kind) && action.product && (
        <div className="agent-fields-row">
          {!!action.product.availableSizes.length && (
            <label className="agent-field">
              <span>{t('size')}</span>
              <select
                required
                value={action.size || ''}
                onChange={(e) => setAction({ ...action, size: e.target.value })}
              >
                <option value="">{t('chooseSize')}</option>
                {action.product.availableSizes.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
          )}
          {action.kind !== 'wishlist_add' && (
            <label className="agent-field">
              <span>{t('quantity')}</span>
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
      {action.kind === 'apply_coupon' && field('code', t('coupon'), true)}
      {action.kind === 'contact' && (
        <>
          {field('name', t('name'), true)}
          {field('email', t('email'), true)}
          <div className="agent-fields-row">
            {field('phone', t('phone'))}
            {field('company', t('company'))}
          </div>
          {field('message', t('message'), true, true)}
        </>
      )}
      {action.kind === 'review' && (
        <>
          <label className="agent-field">
            <span>{t('rating')}</span>
            <select
              required
              value={action.rating || ''}
              onChange={(e) => setAction({ ...action, rating: Number(e.target.value) })}
            >
              <option value="">{t('chooseRating')}</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {t('stars', { count: n })}
                </option>
              ))}
            </select>
          </label>
          {field('title', t('title'), true)}
          {field('content', t('experience'), true, true)}
          <label className="agent-check">
            <input type="checkbox" required checked={honest} onChange={(e) => setHonest(e.target.checked)} />
            {t('honest')}
          </label>
        </>
      )}
      {action.kind === 'update_profile' && (
        <>
          {action.firstName !== undefined && field('firstName', t('firstName'), true)}
          {action.lastName !== undefined && field('lastName', t('lastName'), true)}
          {action.phone !== undefined && field('phone', t('phone'))}
          {action.address !== undefined && field('address', t('address'), false, true)}
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
                  {line?.name || t('orderLine', { id: item.orderItemId })}
                  {line?.size ? ` · ${line.size}` : ''}
                </p>
                <div className="agent-fields-row">
                  <label className="agent-field">
                    <span>{t('returnQuantity')}</span>
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
          {field('note', t('returnNote'), false, true)}
          <p className="agent-muted">{t('returnReview')}</p>
        </>
      )}
      {action.kind === 'cancel_order' && (
        <p className="agent-muted">{t('cancelNote')}</p>
      )}
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="agent-primary" disabled={busy}>
        {busy ? t('working') : label}
      </button>
    </form>
  );
}
