'use client';

import { useEffect, useState } from 'react';
import Link, { useRouter } from '@/i18n/navigation';
import CheckoutApi, { type CheckoutSessionStatus } from '@/core/client/api/Checkout';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import OrderApi from '@/core/client/api/Order';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import type { Order } from '@/shared/types/order';
import { trackPurchase } from '@/shared/client/utils/tracking';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import ProductImage from '@/components/ProductImage';
import { toast } from 'react-toastify';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { transferMemo } from '@/shared/payment';
import OrderProgress from '@/core/client/features/account/components/OrderProgress';
import TransferInstructions from '@/core/client/features/account/components/TransferInstructions';
import { formatOrderAddress } from '@/core/client/features/account/components/OrderDetails';
import { ShowroomCard, type Showroom } from '../components/MeetingSection';

const ThankYou = () => {
  const t = useTranslations('checkout');
  const searchParams = useSearchParams();
  const orderId = Number(searchParams.get('orderId'));
  const [order, setOrder] = useState<Order | null>();
  const payment = useTranslations('fulfillment.payment'),
    locale = useLocale();
  const outcome = searchParams.get('payment');
  const [online, setOnline] = useState<{ paid: boolean; onlinePayment: boolean }>();
  const [opening, setOpening] = useState(false);
  // Back from the payOS page of a QR checkout: wait for its order (created once payOS confirms the payment).
  const router = useRouter();
  const sessionId = Number(searchParams.get('session'));
  const [sessionStatus, setSessionStatus] = useState<CheckoutSessionStatus>();
  const qr = useTranslations('checkoutPayment'),
    done = useTranslations('checkout.thanks'),
    fulfillment = useTranslations('fulfillment');
  const money = (amount: number) => formatVND(amount, locale);
  const { user } = useCurrentUser();
  const [showroom, setShowroom] = useState<Showroom | null>(null);
  useEffect(() => {
    if (order?.fulfillmentMethod !== 'DIRECT_MEETING') return;
    void Api.get('/shipping/showroom')
      .then((response) => setShowroom(response.data ?? null))
      .catch(() => undefined);
  }, [order?.fulfillmentMethod]);
  useEffect(() => {
    if (orderId > 0 || !Number.isInteger(sessionId) || sessionId <= 0) return;
    let active = true,
      attempts = 0;
    const check = () =>
      void CheckoutApi.status(sessionId)
        .then((value) => {
          if (!active) return;
          setSessionStatus(value.status);
          if (value.status === 'COMPLETED' && value.orderId) {
            CheckoutApi.forget();
            router.replace(`/thank-you?orderId=${value.orderId}`);
          } else if ((value.status === 'OPEN' || value.status === 'PAID') && attempts++ < 40) setTimeout(check, 3000);
        })
        .catch(() => active && setSessionStatus('FAILED'));
    check();
    return () => {
      active = false;
    };
  }, [orderId, sessionId, router]);
  // Back from payOS: ask the server to confirm with payOS (the webhook may not have arrived yet).
  useEffect(() => {
    if (!Number.isInteger(orderId) || orderId <= 0) return;
    let active = true;
    void OrderApi.paymentStatus(orderId).then(async (status) => {
      if (!active || !status) return;
      setOnline(status);
      if (status.paid) setOrder((await OrderApi.getMyOrder(orderId)) ?? null);
    });
    return () => {
      active = false;
    };
  }, [orderId, outcome]);
  const payNow = async () => {
    setOpening(true);
    const link = await OrderApi.paymentLink(orderId, locale);
    if (link) window.location.assign(link.checkoutUrl);
    else setOpening(false);
  };

  useEffect(() => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      if (!(sessionId > 0)) setOrder(null);
      return;
    }
    OrderApi.getMyOrder(orderId).then((result) => {
      setOrder(result ?? null);
      // Once per order in this tab (a reload does not count it again); the order id is the event id.
      const key = `tracked-order-${orderId}`;
      if (result && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        trackPurchase(
          result.id,
          result.total,
          (result.items ?? []).map((item) => ({
            id: String(item.productId),
            name: item.productName,
            price: item.unitPrice,
            quantity: item.quantity,
          })),
        );
      }
    });
  }, [orderId]);

  const paidVnd = order?.prepaidVnd || 0;
  const balanceVnd = order ? Math.max(0, order.total - paidVnd) : 0;
  const inPerson = order?.fulfillmentMethod === 'DIRECT_MEETING';
  const parcels = order?.shippingQuote?.plan?.parcels.length ?? 1;
  const visitDate = order?.meeting?.requested.date.split('-').reverse().join('/') ?? '';
  const visitSlot = order?.meeting ? fulfillment(`slots.${order.meeting.requested.slot}`) : '';
  // Greet by the first name of the account (or the recipient's given name).
  const firstName = user?.firstName || order?.recipientName?.split(' ').filter(Boolean).pop() || '';
  const copyCode = () =>
    order && void navigator.clipboard?.writeText(transferMemo(order.id)).then(() => toast.success(done('copied')));

  return (
    <div className="thanks-page">
      {/* Waiting for the payment of a QR checkout, or not found. */}
      {!order && (
        <div className="thanks-hero is-waiting">
          {order === undefined && !sessionStatus ? (
            <span className="thanks-spinner animate-spin" aria-label={done('loading')} />
          ) : (
            <>
              <h1>{t('title')}</h1>
              <p>{sessionStatus ? qr('returnTitle') : t('validationOrder')}</p>
            </>
          )}
          {sessionStatus && (
            <div className="thanks-status" role="status">
              <p>
                {qr(
                  sessionStatus === 'OPEN' || sessionStatus === 'PAID'
                    ? outcome === 'cancel'
                      ? 'returnCancelled'
                      : 'returnWaiting'
                    : sessionStatus === 'FAILED'
                      ? 'failed'
                      : 'returnClosed',
                )}
              </p>
              <Link href="/cart" className="mu-button">
                {qr('backToCart')}
              </Link>
            </div>
          )}
        </div>
      )}

      {order && (
        <>
          {/* Like Shopify's and Amazon's: who it is for, that it worked, and the facts people look for (order code, when it
              arrives, status) in one banner. */}
          <header className="thanks-banner">
            <div className="thanks-banner-main">
              <span className="thanks-check" aria-hidden="true">
                <svg viewBox="0 0 32 32">
                  <path d="M8 16.5l5.5 5.5L24 11" />
                </svg>
              </span>
              <div>
                <small>{done('placed')}</small>
                <h1>{done('greeting', { name: firstName })}</h1>
                <p>
                  {inPerson
                    ? done('nextInPerson', { date: visitDate, slot: visitSlot })
                    : done(paidVnd > 0 ? 'nextCourier' : 'nextCourierUnpaid')}
                </p>
              </div>
            </div>
            <dl className="thanks-facts">
              <div>
                <dt>{done('orderCode')}</dt>
                <dd>
                  <strong>{transferMemo(order.id)}</strong>
                  <button type="button" onClick={copyCode}>
                    {done('copy')}
                  </button>
                </dd>
              </div>
              <div>
                <dt>{done(inPerson ? 'visit' : 'eta')}</dt>
                <dd>
                  <strong>
                    {inPerson
                      ? `${visitDate} · ${visitSlot}`
                      : (order.shippingQuote?.carrier?.estimatedDelivery ?? '—')}
                  </strong>
                </dd>
              </div>
              <div>
                <dt>{done('status')}</dt>
                <dd>
                  <OrderStatusBadge status={order.status} />
                </dd>
              </div>
            </dl>
          </header>

          {order.status === 'PROCESSING' && order.paymentPlan && online && !online.paid && (
            <div className="thanks-status" role="status">
              <p>{payment(outcome === 'cancel' ? 'cancelled' : outcome === 'return' ? 'pending' : 'due')}</p>
              {online.onlinePayment && (
                <button className="mu-button" disabled={opening} onClick={() => void payNow()}>
                  {payment('payNow')}
                </button>
              )}
            </div>
          )}

          <div className="thanks-grid">
            <div className="thanks-main">
              <section className="thanks-card">
                <OrderProgress order={order} />
              </section>

              <section className="thanks-card">
                <h2>{done(inPerson ? 'collectTitle' : 'deliveryTitle')}</h2>
                {inPerson && showroom ? (
                  <ShowroomCard showroom={showroom} />
                ) : (
                  <div className="thanks-address">
                    <strong>
                      {order.recipientName} · {order.phone}
                    </strong>
                    <span>{formatOrderAddress(order)}</span>
                    {order.shippingQuote?.carrier && (
                      <small>
                        {order.shippingQuote.carrier.carrierName}
                        {parcels > 1 ? ` · ${done('parcels', { count: parcels })}` : ''}
                        {order.shippingQuote.carrier.estimatedDelivery
                          ? ` · ${order.shippingQuote.carrier.estimatedDelivery}`
                          : ''}
                      </small>
                    )}
                  </div>
                )}
              </section>

              <section className="thanks-card">
                <h2>
                  {done('itemsTitle', { count: (order.items || []).reduce((sum, item) => sum + item.quantity, 0) })}
                </h2>
                <ul className="thanks-items">
                  {(order.items || []).map((item) => (
                    <li key={item.id}>
                      <span className="thanks-thumb">
                        <ProductImage
                          src={item.imageUrl}
                          alt={item.productName}
                          sizes="56px"
                          className="object-contain"
                        />
                      </span>
                      <span className="thanks-item-name">
                        <strong>{item.productName}</strong>
                        <small>
                          {item.quantity} × {money(item.unitPrice)}
                        </small>
                      </span>
                      <b>{money(item.quantity * item.unitPrice)}</b>
                    </li>
                  ))}
                </ul>
              </section>
              {paidVnd < (order.upfrontDueVnd || 0) && <TransferInstructions order={order} />}
            </div>

            <aside className="thanks-side">
              <section className="thanks-card">
                <h2>{done('paymentTitle')}</h2>
                <dl className="thanks-money">
                  <div>
                    <dt>{done('subtotal')}</dt>
                    <dd>{money(order.subtotal)}</dd>
                  </div>
                  {order.discount > 0 && (
                    <div>
                      <dt>{done('discount')}</dt>
                      <dd>-{money(order.discount)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{done('shipping')}</dt>
                    <dd>{order.shippingFee > 0 ? money(order.shippingFee) : done('free')}</dd>
                  </div>
                  <div className="is-total">
                    <dt>{done('total')}</dt>
                    <dd>{money(order.total)}</dd>
                  </div>
                  <div className="is-paid">
                    <dt>{done('paid')}</dt>
                    <dd>{money(paidVnd)}</dd>
                  </div>
                  <div className="is-balance">
                    <dt>{done(inPerson ? 'balanceAtShop' : 'balanceOnDelivery')}</dt>
                    <dd>{balanceVnd > 0 ? money(balanceVnd) : done('nothing')}</dd>
                  </div>
                </dl>
              </section>
              <div className="thanks-actions">
                <Link href="/order-history" className="mu-button">
                  {t('history')}
                </Link>
                <Link href="/cua-hang" className="mu-button-secondary">
                  {t('continue')}
                </Link>
              </div>
              <p className="thanks-help">{done(inPerson ? 'helpInPerson' : 'help')}</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
};

export default ThankYou;
