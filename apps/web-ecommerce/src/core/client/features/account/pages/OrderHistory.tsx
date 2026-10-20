'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import Link, { useRouter } from '@/i18n/navigation';
import CancelOrderModal from '@/components/Modal/CancelOrderModal';
import ProductImage from '@/components/ProductImage';
import AdminIcon from '@/components/Admin/AdminIcon';
import OrderApi from '@/core/client/api/Order';
import ProductApi from '@/core/client/api/Product';
import CheckoutApi from '@/core/client/api/Checkout';
import StorePagination from '@/core/client/features/shop/components/StorePagination';
import { useCart } from '@/shared/client/providers/CartProvider';
import { formatVND } from '@/shared/server/utils/utils';
import { cancellationFeeVnd } from '@/shared/cancellation';
import type { Pagination } from '@/shared/types/pagination';
import type { Order } from '@/shared/types/order';
import OrderDetails from '../components/OrderDetails';
import OrderReturns from '../components/OrderReturns';
import OrderProgress from '../components/OrderProgress';
import PendingCheckouts from '../components/PendingCheckouts';

const PAGE_SIZE = 5;
const TABS = ['all', 'to_pay', 'to_ship', 'shipping', 'delivered', 'cancelled'] as const;
type Tab = (typeof TABS)[number];

// The order's state as the customer reads it (marketplace wording), from the order and its waybill.
const stateOf = (order: Order) => {
  if (order.status === 'CANCELLED') return 'cancelled';
  if (order.status === 'DELIVERED') return 'delivered';
  if (order.status === 'SHIPPED') return 'shipping';
  if (order.cancelRequest?.status === 'PENDING') return 'cancelRequested';
  if (order.paymentPlan && (order.prepaidVnd || 0) === 0) return 'toPay';
  if (order.fulfillmentMethod === 'DIRECT_MEETING') return 'awaitingHandover';
  return order.shipments?.some((row) => row.status !== 'CANCELLED') ? 'awaitingPickup' : 'preparing';
};

// The customer's purchases, organised like large marketplaces' "Đơn mua": tabs by state with counts, an order card per
// order (items, total, what happens next, the actions that make sense now) and the full detail with its progress.
// Checkouts waiting for their QR payment are not orders yet: they are listed under "Chờ thanh toán" with their
// countdown and stock held until it ends.
const OrderHistory = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const Heading = embedded ? 'h2' : 'h1';
  const t = useTranslations('purchases'),
    checkout = useTranslations('checkout'),
    cancellation = useTranslations('cancellation'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const router = useRouter();
  const { addItem } = useCart();
  const [tab, setTab] = useState<Tab>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pendingCheckouts, setPendingCheckouts] = useState(0);
  const [pagination, setPagination] = useState<Pagination>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const [result, summary, open] = await Promise.all([
      OrderApi.getMyOrders(page, PAGE_SIZE, tab),
      OrderApi.summary(),
      CheckoutApi.open().catch(() => []),
    ]);
    setOrders(result?.data || []);
    setPagination(result?.pagination);
    setCounts(summary || {});
    setPendingCheckouts(open.length);
    setLoading(false);
  }, [page, tab]);
  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);
  useCustomerActionRefresh('cancel_order,return_request', loadOrders);

  const replace = (updated: Order) =>
    setOrders((current) => current.map((row) => (row.id === updated.id ? updated : row)));
  const cancelOrder = async (input: { reason: string; note?: string }) => {
    if (!cancelling) return false;
    const updated = await OrderApi.cancelMyOrder(cancelling.id, input);
    if (updated) {
      replace(updated);
      void OrderApi.summary().then((value) => value && setCounts(value));
    }
    return !!updated;
  };
  // A customer who cancels a paid order forfeits 50% of the deposit (src/shared/cancellation.ts).
  const feeIfCancelled = (order: Order) =>
    cancellationFeeVnd({
      prepaidVnd: order.prepaidVnd || 0,
      paymentPlan: order.paymentPlan,
      upfrontDueVnd: order.upfrontDueVnd || 0,
      total: order.total,
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
    });
  // Paid orders and orders with a waybill are cancelled by the shop on request (refund, carrier cancellation).
  const needsRequest = (order: Order) =>
    (order.prepaidVnd || 0) > 0 || !!order.shipments?.some((row) => row.status !== 'CANCELLED');
  const cancellingFee = cancelling ? feeIfCancelled(cancelling) : 0;
  const pickedUp = (order: Order) =>
    !!order.shipments?.some((row) => !['CREATED', 'AWAITING_PICKUP', 'CANCELLED'].includes(row.status));

  // "Buy again": the order's models go back into the bag at today's prices and stock.
  const buyAgain = async (order: Order) => {
    let added = 0;
    for (const item of order.items || []) {
      const product = await ProductApi.getProduct(item.productId);
      if (product && product.stock > 0 && addItem(product, item.size || '', Math.min(item.quantity, product.stock)))
        added += 1;
    }
    if (added) router.push('/cart');
    else toast.info(t('buyAgainUnavailable'));
  };

  // The API layer camel-cases response keys (to_ship → toShip).
  const countOf = (value: Tab) => counts[value.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase())] || 0;
  const tabCount = (value: Tab) => countOf(value) + (value === 'to_pay' ? pendingCheckouts : 0);

  return (
    <div className="purchases mx-auto max-w-5xl px-4 py-10">
      <Heading className="mb-6 text-3xl font-bold">{checkout('historyTitle')}</Heading>
      <div className="purchases-tabs" role="tablist" aria-label={t('tabsLabel')}>
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setPage(1);
              setOpenId(null);
            }}
          >
            {t(`tabs.${value}`)}
            {value !== 'all' && !!tabCount(value) && (
              <span className="purchases-tab-count">{tabCount(value)}</span>
            )}
          </button>
        ))}
      </div>

      {(tab === 'all' || tab === 'to_pay') && <PendingCheckouts onPaid={() => void loadOrders()} />}

      {loading && orders.length === 0 ? (
        <div className="flex justify-center py-24">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="purchases-empty">
          <AdminIcon name="bag" size={36} />
          <p>{t(`empty.${tab}`)}</p>
          <Link href="/cua-hang" className="mu-button">
            {checkout('continue')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const state = stateOf(order);
            const open = openId === order.id;
            const shipment = order.shipments?.filter((row) => row.status !== 'CANCELLED').at(-1);
            const due = state === 'toPay' && order.paymentDueAt ? new Date(order.paymentDueAt) : null;
            return (
              <article key={order.id} className={`order-card is-${state}`} aria-labelledby={`order-${order.id}`}>
                <header className="order-card-header">
                  <span id={`order-${order.id}`}>
                    <strong>{t('orderCode', { code: `MU${order.id}` })}</strong>
                    <small>{new Date(order.createdAt).toLocaleString(locale)}</small>
                  </span>
                  <span className={`order-state is-${state}`}>{t(`state.${state}`)}</span>
                </header>
                {(shipment || state === 'toPay' || order.meeting) && (
                  <p className="order-card-next">
                    <AdminIcon name="truck" size={16} />
                    {state === 'toPay'
                      ? due
                        ? t('payBy', { time: due.toLocaleString(locale) })
                        : t('toPayNote')
                      : shipment
                        ? `${shipment.carrierName || shipment.carrier} · ${t(`shipment.${shipment.status}`)}`
                        : order.meeting
                          ? t(`meeting.${order.meeting.status}`)
                          : ''}
                  </p>
                )}
                <ul className="order-card-items">
                  {(order.items || []).map((item) => (
                    <li key={item.id}>
                      <span className="order-card-thumb">
                        <ProductImage
                          src={item.imageUrl}
                          alt={item.productName}
                          sizes="64px"
                          className="object-contain"
                        />
                      </span>
                      <span className="order-card-name">
                        <Link href={`/shop/product/${item.productId}`}>{item.productName}</Link>
                        <small>× {item.quantity}</small>
                      </span>
                      <span className="order-card-price">{money(item.unitPrice * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="order-card-total">
                  {(order.prepaidVnd || 0) > 0 && order.status !== 'CANCELLED' && (
                    <small>
                      {t('paidSplit', {
                        paid: money(order.prepaidVnd || 0),
                        rest: money(Math.max(0, order.total - (order.prepaidVnd || 0))),
                      })}
                    </small>
                  )}
                  <span>
                    {t('total')} <strong>{money(order.total)}</strong>
                  </span>
                </div>
                <footer className="order-card-actions">
                  {state === 'toPay' && (
                    <button type="button" className="mu-button" onClick={() => setOpenId(order.id)}>
                      {t('actions.pay')}
                    </button>
                  )}
                  {['delivered', 'cancelled'].includes(state) && (
                    <button type="button" className="mu-button" onClick={() => void buyAgain(order)}>
                      {t('actions.buyAgain')}
                    </button>
                  )}
                  {state === 'delivered' && order.items?.[0] && (
                    <Link className="mu-button-secondary" href={`/shop/product/${order.items[0].productId}#reviews`}>
                      {t('actions.review')}
                    </Link>
                  )}
                  {order.status === 'PROCESSING' && order.cancelRequest?.status !== 'PENDING' && !pickedUp(order) && (
                    <button type="button" className="order-card-cancel" onClick={() => setCancelling(order)}>
                      {cancellation(needsRequest(order) ? 'requestButton' : 'button')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="order-card-toggle"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : order.id)}
                  >
                    {t(open ? 'actions.hideDetail' : ['awaitingPickup', 'shipping'].includes(state) ? 'actions.track' : 'actions.detail')}
                  </button>
                </footer>
                {open && (
                  <div className="order-card-detail">
                    <OrderProgress order={order} />
                    {order.status === 'CANCELLED' && order.cancelReason && (
                      <p className="order-card-notice">
                        {cancellation('cancelledBecause', {
                          by: cancellation(`by.${order.cancelledBy || 'staff'}`),
                          reason: cancellation(`reasons.${order.cancelReason}`),
                        })}
                        {order.cancelNote ? ` – ${order.cancelNote}` : ''}
                        {(order.cancellationFeeVnd || 0) > 0 &&
                          ` ${cancellation('feeKept', {
                            fee: money(order.cancellationFeeVnd || 0),
                            refund: money((order.prepaidVnd || 0) - (order.cancellationFeeVnd || 0)),
                          })}`}
                      </p>
                    )}
                    {order.cancelRequest?.status === 'PENDING' && (
                      <p className="order-card-notice" role="status">
                        {cancellation('requestPending')}
                      </p>
                    )}
                    {order.status === 'PROCESSING' && order.cancelRequest?.status === 'REJECTED' && (
                      <p className="order-card-notice">
                        {cancellation('requestRejected', { note: order.cancelRequest.decisionNote || '' })}
                      </p>
                    )}
                    <OrderDetails order={order} onChange={replace} hideItems />
                    {order.status === 'DELIVERED' && <OrderReturns order={order} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <StorePagination
        pagination={pagination}
        onPageChange={(nextPage) => {
          setOpenId(null);
          setPage(nextPage);
        }}
      />

      <CancelOrderModal
        open={!!cancelling}
        audience="customer"
        title={checkout('cancelOrderConfirm', { id: cancelling?.id || 0 })}
        notice={
          cancelling && needsRequest(cancelling)
            ? [
                cancellation('requestNotice'),
                cancellingFee > 0
                  ? cancellation('feeNotice', {
                      fee: money(cancellingFee),
                      refund: money((cancelling.prepaidVnd || 0) - cancellingFee),
                    })
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            : cancellation('immediateNotice')
        }
        onConfirm={cancelOrder}
        onClose={() => setCancelling(null)}
      />
    </div>
  );
};

export default OrderHistory;
