'use client';

import DateTimeInput from '@/components/DateTimeInput';

import { useLocale, useTranslations } from 'next-intl';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { formatVND } from '@/shared/server/utils/utils';
import AdminIcon from '@/components/Admin/AdminIcon';
import {
  MEETING_SLOTS,
  vnDate,
  type CarrierQuote,
  type FulfillmentMethod,
  type MeetingSlot,
} from '@/shared/fulfillment';

export interface FeeQuote {
  feeVnd: number;
  carrier: CarrierQuote | null;
  options: CarrierQuote[];
  source: 'superai' | 'estimate';
}

// Checkout delivery choice (docs/business/deposit-delivery-specification.md): courier delivery with the rest collected
// on delivery, or an in-person handover at a place and time the shop confirms. A compact two-way switch; the handover
// adds its date and time slot.
export default function FulfillmentPicker() {
  const t = useTranslations('fulfillment');
  const { fulfillmentMethod, setFulfillmentMethod, meeting, setMeeting } = useCheckoutDraft();
  return (
    <>
      <div className="fulfillment-switch" role="radiogroup" aria-label={t('method.title')}>
        {(['COURIER_COD', 'DIRECT_MEETING'] as const).map((method: FulfillmentMethod) => (
          <label
            key={method}
            className={fulfillmentMethod === method ? 'is-selected' : ''}
            title={t(`method.${method}Hint`)}
          >
            <input
              type="radio"
              name="fulfillment-method"
              checked={fulfillmentMethod === method}
              onChange={() => setFulfillmentMethod(method)}
            />
            <AdminIcon name={method === 'COURIER_COD' ? 'truck' : 'users'} size={16} />
            {t(`method.${method}Short`)}
          </label>
        ))}
      </div>
      {fulfillmentMethod === 'DIRECT_MEETING' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="payment-plan-note sm:col-span-2">{t('meetingPlaceHint')}</p>
          <label className="mu-field">
            {t('meetingDate')}
            <DateTimeInput
              type="date"
              min={vnDate()}
              required
              value={meeting.date}
              onChange={(event) => setMeeting({ ...meeting, date: event.target.value })}
            />
          </label>
          <label className="mu-field">
            {t('meetingSlot')}
            <select
              value={meeting.slot}
              onChange={(event) => setMeeting({ ...meeting, slot: event.target.value as MeetingSlot })}
            >
              {MEETING_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {t(`slots.${slot}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </>
  );
}

// The courier for the address (SuperAI quotes every carrier; the cheapest is used and its fee added to the order) in
// one line, with the other carriers' prices folded underneath.
export function CarrierQuoteLine({ quote, quoting }: { quote: FeeQuote | null; quoting: boolean }) {
  const t = useTranslations('fulfillment'),
    locale = useLocale();
  const carrier = quote?.carrier;
  return (
    <div className="carrier-quote" aria-live="polite">
      <div className="carrier-quote-line">
        <AdminIcon name="truck" size={18} />
        <span>
          {quoting ? (
            <strong>{t('feeQuoting')}</strong>
          ) : quote ? (
            <>
              <strong>
                {carrier ? carrier.carrierName : t('feeEstimated', { amount: formatVND(quote.feeVnd, locale) })}
              </strong>
              {carrier?.estimatedDelivery && <small>{t('eta', { text: carrier.estimatedDelivery })}</small>}
            </>
          ) : (
            <small>{t('carrierPending')}</small>
          )}
        </span>
        {!quoting && carrier && <b>{formatVND(quote.feeVnd, locale)}</b>}
      </div>
      {!quoting && quote && quote.options.length > 1 && (
        <details>
          <summary>{t('cheapestOf', { count: quote.options.length })}</summary>
          <ul>
            {quote.options.map((option) => (
              <li key={option.carrierId} className={option.carrierId === carrier?.carrierId ? 'is-chosen' : ''}>
                <span>{option.carrierName}</span>
                <span>{formatVND(option.feeVnd, locale)}</span>
                <small>{option.estimatedDelivery}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
