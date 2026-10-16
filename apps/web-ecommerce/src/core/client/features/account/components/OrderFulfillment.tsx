'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { MEETING_SLOTS, vnDate } from '@/shared/fulfillment';
import type { Order } from '@/shared/types/order';

// How the order reaches the customer: the in-person appointment (with the handover code) or the SPX waybill, its
// tracking and the COD, plus the verified payments. `onChange` (customer view) enables proposing a new appointment.
export default function OrderFulfillment({ order, onChange }: { order: Order; onChange?: (order: Order) => void }) {
  const t = useTranslations('fulfillment'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  if (!order.fulfillmentMethod) return null;
  const meeting = order.meeting;
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
            {t('order.requested', { address: `${meeting.requested.address}, ${meeting.requested.city}`, date: meeting.requested.date, slot: t(`slots.${meeting.requested.slot}`) })}
          </p>
          {meeting.changeRequest && (
            <p className="mu-note">
              {t('order.changePending', { address: `${meeting.changeRequest.address}, ${meeting.changeRequest.city}`, date: meeting.changeRequest.date, slot: t(`slots.${meeting.changeRequest.slot}`) })}
            </p>
          )}
          {meeting.confirmedAt && (
            <p>
              {t('order.confirmed', { address: meeting.confirmedAddress || '', time: new Date(meeting.confirmedAt).toLocaleString(locale) })}
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
                    <input name="address" minLength={4} maxLength={255} required defaultValue={meeting.requested.address} />
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
      {order.fulfillmentMethod === 'SPX_COD' && (
        <div className="space-y-3 text-sm">
          {!order.shipments?.length && <p className="mu-note">{t('order.noWaybill')}</p>}
          {order.shipments?.map((shipment) => (
            <div key={shipment.id} className="space-y-1">
              <p>
                {t('order.tracking')}: <strong>{shipment.trackingNumber}</strong> · {t(`shipmentStatus.${shipment.status}`)}
              </p>
              <p className="mu-note">
                {t('order.cod', { amount: money(shipment.codAmountVnd) })} · {t('order.fee', { amount: money(shipment.shippingFeeVnd) })} ·{' '}
                {t(`feePayer.${shipment.feePayer}`)}
              </p>
              {shipment.failureReason && shipment.status === 'DELIVERY_FAILED' && <p className="mu-note">{shipment.failureReason}</p>}
              {shipment.trackingUrl && (
                <a className="underline" href={shipment.trackingUrl} target="_blank" rel="noreferrer">
                  {t('order.track')}
                </a>
              )}
              {!!shipment.events?.length && (
                <ol className="mu-note list-inside list-disc">
                  {shipment.events
                    .filter((event) => event.applied)
                    .map((event) => (
                      <li key={event.id}>
                        {t(`shipmentStatus.${event.status}`)} · {new Date(event.createdAt).toLocaleString(locale)}
                        {event.reason ? ` · ${event.reason}` : ''}
                      </li>
                    ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
      {!!order.prepayments?.length && (
        <div className="text-sm">
          <h4 className="font-semibold">{t('order.paymentHistory')}</h4>
          <ul className="mu-note">
            {order.prepayments.map((payment) => (
              <li key={payment.id}>
                {t(`order.prepaymentKind.${payment.kind}`)} · {money(payment.amountVnd)} · {new Date(payment.createdAt).toLocaleString(locale)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
