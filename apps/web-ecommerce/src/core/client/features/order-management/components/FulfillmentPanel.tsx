'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { SHIPMENT_STATUSES, SHIPMENT_TRANSITIONS, type PackageSpec } from '@/shared/fulfillment';
import type { Order } from '@/shared/types/order';

interface Quote {
  feeVnd: number;
  expectedDeliveryTime: string | null;
  mode: 'live' | 'simulate';
  codAmountVnd: number;
  codLimitVnd: number;
}

// Staff side of the deposit-order delivery: confirm the in-person appointment and record the handover, or confirm
// the package and create the GHN order (automatic after a verified payment), refresh tracking, cancel it, or simulate
// carrier events in simulate mode.
export default function FulfillmentPanel({ order, onChange }: { order: Order; onChange: (order: Order) => void }) {
  const t = useTranslations('fulfillment'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useState<PackageSpec>();
  const [quote, setQuote] = useState<Quote>();
  const waybillKey = useRef<string>('');
  useEffect(() => {
    if (order.fulfillmentMethod !== 'COURIER_COD') return;
    void Api.get(`/admin/orders/${order.id}/package`)
      .then((response) => setSpec(response.data))
      .catch(() => undefined);
  }, [order.id, order.fulfillmentMethod]);
  if (!order.fulfillmentMethod) return null;

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      onChange((await Api.post(`/admin/orders/${path}`, body)).data);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };
  const formBody = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
  };
  const meeting = order.meeting;
  const deposited = (order.prepaidVnd || 0) >= (order.upfrontDueVnd || 0) && (order.prepaidVnd || 0) > 0;
  const balance = Math.max(0, order.total - (order.prepaidVnd || 0));
  const active = order.shipments?.find((row) => !['CANCELLED', 'RETURNED'].includes(row.status));
  const packageField = (key: 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm') => (
    <label className="mu-field" key={key}>
      {t(`admin.${key}`)}
      <input
        type="number"
        min={1}
        step={1}
        required
        value={spec?.[key] ?? ''}
        onChange={(event) => {
          setQuote(undefined);
          setSpec(spec && { ...spec, [key]: Number(event.target.value) });
        }}
      />
    </label>
  );

  return (
    <section className="mu-panel space-y-4 p-5">
      <h2 className="text-xl font-bold">
        {t('admin.panelTitle')} · {t(`method.${order.fulfillmentMethod}`)}
      </h2>
      {!deposited && order.status === 'PROCESSING' && <p className="prepayment-warning">{t('admin.depositFirst')}</p>}

      {meeting && (
        <div className="space-y-4">
          <p className="mu-note">
            {t('order.meetingStatusLabel')}: {t(`order.meetingStatus.${meeting.status}`)}
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
          {deposited && !['COMPLETED'].includes(meeting.status) && order.status === 'PROCESSING' && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                const body = formBody(event);
                void post(`${order.id}/meeting/confirm`, {
                  address: body.address,
                  at: new Date(body.at).toISOString(),
                });
              }}
            >
              <h3 className="font-semibold">{t('admin.confirmTitle')}</h3>
              <label className="mu-field">
                {t('admin.address')}
                <input
                  name="address"
                  required
                  minLength={4}
                  defaultValue={
                    meeting.changeRequest
                      ? `${meeting.changeRequest.address}, ${meeting.changeRequest.city}`
                      : meeting.confirmedAddress || `${meeting.requested.address}, ${meeting.requested.city}`
                  }
                />
              </label>
              <label className="mu-field">
                {t('admin.at')}
                <input name="at" type="datetime-local" required />
              </label>
              <button className="mu-button" disabled={busy}>
                {t('admin.confirm')}
              </button>
            </form>
          )}
          {meeting.status === 'APPOINTMENT_CONFIRMED' && (
            <form
              className="space-y-3 border-t border-stroke pt-4"
              onSubmit={(event) => {
                const body = formBody(event);
                void post(`${order.id}/handover`, {
                  handoverCode: body.handoverCode,
                  itemsChecked: body.itemsChecked === 'on',
                  moneyVerified: body.moneyVerified === 'on',
                  amountVnd: balance,
                  paymentMethod: body.paymentMethod,
                  externalReference: body.externalReference,
                  reason: body.reason,
                });
              }}
            >
              <h3 className="font-semibold">{t('admin.handoverTitle')}</h3>
              <label className="mu-field">
                {t('admin.code')}
                <input name="handoverCode" inputMode="numeric" pattern="[0-9]{6}" required />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input className="mt-1" name="itemsChecked" type="checkbox" required />
                {t('admin.itemsChecked')}
              </label>
              {balance > 0 && (
                <>
                  <p>{t('admin.balance', { amount: money(balance) })}</p>
                  <label className="mu-field">
                    {t('admin.paymentMethodLabel')}
                    <select name="paymentMethod">
                      <option value="cash">{t('admin.paymentMethod.cash')}</option>
                      <option value="transfer">{t('admin.paymentMethod.transfer')}</option>
                    </select>
                  </label>
                  <label className="mu-field">
                    {t('admin.reference')}
                    <input name="externalReference" maxLength={128} />
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input className="mt-1" name="moneyVerified" type="checkbox" required />
                    {t('admin.moneyVerified', { amount: money(balance) })}
                  </label>
                </>
              )}
              <label className="mu-field">
                {t('admin.note')}
                <input name="reason" maxLength={500} />
              </label>
              <button className="mu-button" disabled={busy}>
                {t('admin.complete')}
              </button>
            </form>
          )}
          {!['COMPLETED', 'NOT_HELD'].includes(meeting.status) && (
            <form
              className="space-y-3 border-t border-stroke pt-4"
              onSubmit={(event) => void post(`${order.id}/meeting/not-held`, { reason: formBody(event).reason })}
            >
              <label className="mu-field">
                {t('admin.notHeldReason')}
                <input name="reason" required maxLength={1000} />
              </label>
              <button className="mu-button-secondary" disabled={busy}>
                {t('admin.notHeld')}
              </button>
            </form>
          )}
          {meeting.history?.length > 0 && (
            <ol className="mu-note list-inside list-disc text-sm">
              {meeting.history.map((entry, index) => (
                <li key={index}>
                  {t(`admin.history.${entry.action}`)} · {new Date(entry.at).toLocaleString(locale)}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {order.fulfillmentMethod === 'COURIER_COD' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            {order.status === 'PROCESSING' && !deposited && (
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void post(`${order.id}/payment-status`, {})}
              >
                {t('admin.checkPayment')}
              </button>
            )}
            {active && (
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void post(`${order.id}/tracking`, {})}
              >
                {t('admin.refreshTracking')}
              </button>
            )}
          </div>
          {!active && order.status === 'PROCESSING' && deposited && spec && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!waybillKey.current) waybillKey.current = crypto.randomUUID();
                void post(`${order.id}/shipments`, { requestKey: waybillKey.current, package: spec }).then((ok) => {
                  if (ok) waybillKey.current = '';
                });
              }}
            >
              <h3 className="font-semibold">{t('admin.waybillTitle')}</h3>
              <p className="mu-note">{t('admin.autoNote')}</p>
              <div className="grid grid-cols-2 gap-3">
                {(['weightGram', 'lengthCm', 'widthCm', 'heightCm'] as const).map(packageField)}
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={spec.fragile}
                  onChange={(event) => setSpec({ ...spec, fragile: event.target.checked })}
                />
                {t('admin.fragile')}
              </label>
              <button
                type="button"
                className="mu-button-secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    setQuote((await Api.post(`/admin/orders/${order.id}/shipments/quote`, { package: spec })).data);
                  } catch {
                    /* The toast explains it. */
                  }
                }}
              >
                {t('admin.quote')}
              </button>
              {quote && (
                <p className="mu-note">
                  {t('admin.quoteResult', {
                    fee: money(quote.feeVnd),
                    cod: money(quote.codAmountVnd),
                    limit: money(quote.codLimitVnd),
                  })}
                </p>
              )}
              <p className="mu-note">{t(quote?.mode === 'live' ? 'admin.liveNote' : 'admin.simulateNote')}</p>
              <button className="mu-button" disabled={busy || !quote}>
                {t('admin.create')}
              </button>
            </form>
          )}
          {order.shipments?.map((shipment) => {
            const next = SHIPMENT_TRANSITIONS[shipment.status];
            const open = !['DELIVERED', 'RETURNED', 'CANCELLED'].includes(shipment.status);
            return (
              <div key={shipment.id} className="space-y-2 border-t border-stroke pt-3 text-sm">
                <p>
                  <strong>{shipment.trackingNumber}</strong> · {t(`shipmentStatus.${shipment.status}`)}
                  {shipment.carrierStatus ? ` (${shipment.carrierStatus})` : ''} ·{' '}
                  {t(`admin.mode.${shipment.mode === 'live' ? 'live' : 'simulate'}`)}
                </p>
                <p className="mu-note">
                  {t('order.cod', { amount: money(shipment.codAmountVnd) })} ·{' '}
                  {t('order.fee', { amount: money(shipment.shippingFeeVnd) })}
                </p>
                {shipment.trackingUrl && shipment.mode === 'live' && (
                  <a className="underline" href={shipment.trackingUrl} target="_blank" rel="noreferrer">
                    {t('order.track')}
                  </a>
                )}
                {shipment.mode !== 'live' && next.length > 0 && (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      const body = formBody(event);
                      void post(`shipments/${shipment.id}/events`, { status: body.status, reason: body.reason });
                    }}
                  >
                    <label className="mu-field">
                      {t('admin.eventStatus')}
                      <select name="status">
                        {SHIPMENT_STATUSES.filter((status) => next.includes(status)).map((status) => (
                          <option key={status} value={status}>
                            {t(`shipmentStatus.${status}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mu-field">
                      {t('admin.eventReason')}
                      <input name="reason" maxLength={500} />
                    </label>
                    <button className="mu-button-secondary" disabled={busy}>
                      {t('admin.simulate')}
                    </button>
                  </form>
                )}
                {open && ['CREATED', 'AWAITING_PICKUP'].includes(shipment.status) && (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) =>
                      void post(`shipments/${shipment.id}/cancel`, { reason: formBody(event).reason })
                    }
                  >
                    <label className="mu-field">
                      {t('admin.cancelReason')}
                      <input name="reason" required maxLength={500} />
                    </label>
                    <button className="mu-button-secondary" disabled={busy}>
                      {t('admin.cancelWaybill')}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
