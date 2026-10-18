'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { MEETING_SLOTS, TRACKING_STEPS, vnDate } from '@/shared/fulfillment';
import OrderApi from '@/core/client/api/Order';
import type { Order } from '@/shared/types/order';

// How the order reaches the customer: the in-person appointment (with the handover code) or the GHN waybill, its
// tracking and the COD, plus the verified payments. `onChange` (customer view) enables proposing a new appointment.
export default function OrderFulfillment({ order, onChange }: { order: Order; onChange?: (order: Order) => void }) {
  const t = useTranslations('fulfillment'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  if (!order.fulfillmentMethod) return null;
  const meeting = order.meeting;
  const awaitingPayment =
    order.status === 'PROCESSING' && !!order.paymentPlan && (order.prepaidVnd || 0) < (order.upfrontDueVnd || 0);
  const payNow = async () => {
    setBusy(true);
    const link = await OrderApi.paymentLink(order.id, locale);
    if (link) window.location.assign(link.checkoutUrl);
    else setBusy(false);
  };
  const refresh = async () => {
    setBusy(true);
    const updated = await OrderApi.tracking(order.id);
    if (updated) onChange?.(updated);
    setBusy(false);
  };
  const requestChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      const updated = (await Api.post(`/orders/${order.id}/meeting-change`, form)).data as Order;
      onChange?.(updated);
      setChanging(false);
    } catch {
      /* The toast explains the problem. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-md border border-stroke p-4 dark:border-store-card">
      <h3 className="font-semibold">
        {t('order.methodLabel')}: {t(`method.${order.fulfillmentMethod}`)}
      </h3>
      {meeting && (
        <div className="space-y-2 text-sm">
          <p>
            {t('order.meetingStatusLabel')}: <strong>{t(`order.meetingStatus.${meeting.status}`)}</strong>
          </p>
          <p className="mu-note">
            {t('order.requested', {
              address: `${meeting.requested.address}, ${meeting.requested.city}`,
              date: meeting.requested.date,
              slot: t(`slots.${meeting.requested.slot}`),
            })}
          </p>
          {meeting.changeRequest && (
            <p className="mu-note">
              {t('order.changePending', {
                address: `${meeting.changeRequest.address}, ${meeting.changeRequest.city}`,
                date: meeting.changeRequest.date,
                slot: t(`slots.${meeting.changeRequest.slot}`),
              })}
            </p>
          )}
          {meeting.confirmedAt && (
            <p>
              {t('order.confirmed', {
                address: meeting.confirmedAddress || '',
                time: new Date(meeting.confirmedAt).toLocaleString(locale),
              })}
            </p>
          )}
          {order.handoverCode && meeting.status !== 'COMPLETED' && onChange && (
            <p className="rounded-md bg-gray-2 p-3 dark:bg-store-panel">
              {t('order.handoverCode')}: <strong className="text-lg tracking-widest">{order.handoverCode}</strong>
              <br />
              <span className="mu-note">{t('order.handoverCodeNote')}</span>
            </p>
          )}
          {onChange && order.status === 'PROCESSING' && !['COMPLETED', 'NOT_HELD'].includes(meeting.status) && (
            <>
              <button type="button" className="underline" onClick={() => setChanging(!changing)}>
                {t('order.changeTitle')}
              </button>
              {changing && (
                <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void requestChange(event)}>
                  <label className="mu-field sm:col-span-2">
                    {t('meetingPlace')}
                    <input
                      name="address"
                      minLength={4}
                      maxLength={255}
                      required
                      defaultValue={meeting.requested.address}
                    />
                  </label>
                  <label className="mu-field">
                    {t('order.city')}
                    <input name="city" required maxLength={120} defaultValue={meeting.requested.city} />
                  </label>
                  <label className="mu-field">
                    {t('meetingDate')}
                    <input name="date" type="date" min={vnDate()} required />
                  </label>
                  <label className="mu-field">
                    {t('meetingSlot')}
                    <select name="slot">
                      {MEETING_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {t(`slots.${slot}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mu-field sm:col-span-2">
                    {t('meetingNote')}
                    <input name="note" maxLength={500} />
                  </label>
                  <button className="mu-button sm:col-span-2" disabled={busy}>
                    {t('order.changeSubmit')}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
      {order.fulfillmentMethod === 'COURIER_COD' && (
        <div className="space-y-4 text-sm">
          {onChange && awaitingPayment && (
            <div className="rounded-md border border-dashed border-brand-hover p-3">
              <p>{t('payment.due')}</p>
              <button type="button" className="mu-button mt-2" disabled={busy} onClick={() => void payNow()}>
                {t('payment.payNow')}
              </button>
            </div>
          )}
          {!order.shipments?.length && (
            <p className="mu-note">{t(awaitingPayment && onChange ? 'order.waitingPayment' : 'order.noWaybill')}</p>
          )}
          {order.shipments?.map((shipment) => {
            const reached = (step: string) => {
              const order = TRACKING_STEPS as readonly string[];
              const current = shipment.status === 'AWAITING_PICKUP' ? 'CREATED' : shipment.status;
              return order.indexOf(step) <= order.indexOf(current);
            };
            return (
              <div key={shipment.id} className="space-y-3">
                <p>
                  {t('order.tracking')}: <strong className="tracking-wider">{shipment.trackingNumber}</strong> ·{' '}
                  {t(`shipmentStatus.${shipment.status}`)}
                </p>
                {!['CANCELLED', 'RETURNING', 'RETURNED', 'EXCEPTION'].includes(shipment.status) && (
                  <ol className="tracking-steps" aria-label={t('order.trackingSteps')}>
                    {TRACKING_STEPS.map((step) => (
                      <li
                        key={step}
                        className={
                          reached(step)
                            ? step === (shipment.status === 'AWAITING_PICKUP' ? 'CREATED' : shipment.status)
                              ? 'is-current'
                              : 'is-done'
                            : ''
                        }
                      >
                        {t(`trackingStep.${step}`)}
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mu-note">
                  {t('order.cod', { amount: money(shipment.codAmountVnd) })}
                  {shipment.expectedDeliveryAt
                    ? ` · ${t('eta', { date: new Date(shipment.expectedDeliveryAt).toLocaleDateString(locale) })}`
                    : ''}
                </p>
                {shipment.failureReason && shipment.status === 'DELIVERY_FAILED' && (
                  <p className="mu-note">{shipment.failureReason}</p>
                )}
                <div className="flex flex-wrap gap-4">
                  {shipment.trackingUrl && shipment.mode === 'live' && (
                    <a className="underline" href={shipment.trackingUrl} target="_blank" rel="noreferrer">
                      {t('order.track')}
                    </a>
                  )}
                  {onChange && (
                    <button type="button" className="underline" disabled={busy} onClick={() => void refresh()}>
                      {t('order.refresh')}
                    </button>
                  )}
                </div>
                {!!shipment.events?.length && (
                  <ol className="mu-note space-y-1 border-l-2 border-stroke pl-3 dark:border-store-card">
                    {[...shipment.events]
                      .filter((event) => event.applied)
                      .reverse()
                      .map((event) => (
                        <li key={event.id}>
                          <span className="font-semibold">{t(`shipmentStatus.${event.status}`)}</span> ·{' '}
                          {new Date(event.createdAt).toLocaleString(locale)}
                          {event.reason ? ` · ${event.reason}` : ''}
                        </li>
                      ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!!order.prepayments?.length && (
        <div className="text-sm">
          <h4 className="font-semibold">{t('order.paymentHistory')}</h4>
          <ul className="mu-note">
            {order.prepayments.map((payment) => (
              <li key={payment.id}>
                {t(`order.prepaymentKind.${payment.kind}`)} · {money(payment.amountVnd)} ·{' '}
                {new Date(payment.createdAt).toLocaleString(locale)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
