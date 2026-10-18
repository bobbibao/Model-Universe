'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { formatVND } from '@/shared/server/utils/utils';
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
// on delivery (SuperAI quotes every carrier for the address; the cheapest is used and its fee added to the order), or
// an in-person handover at a place and time the shop confirms.
export default function FulfillmentPicker({ quote, quoting }: { quote: FeeQuote | null; quoting: boolean }) {
  const t = useTranslations('fulfillment'),
    locale = useLocale();
  const { fulfillmentMethod, setFulfillmentMethod, meeting, setMeeting } = useCheckoutDraft();
  const option = (method: FulfillmentMethod) => (
    <label className={`payment-plan-option${fulfillmentMethod === method ? ' is-selected' : ''}`}>
      <input
        type="radio"
        name="fulfillment-method"
        checked={fulfillmentMethod === method}
        onChange={() => setFulfillmentMethod(method)}
      />
      <span>
        <strong>{t(`method.${method}`)}</strong>
        <small>{t(`method.${method}Hint`)}</small>
      </span>
    </label>
  );
  return (
    <fieldset className="payment-plan">
      <legend>{t('method.title')}</legend>
      {option('COURIER_COD')}
      {option('DIRECT_MEETING')}
      {fulfillmentMethod === 'COURIER_COD' && (
        <div className="carrier-quote text-sm" aria-live="polite">
          <p>
            {quoting
              ? t('feeQuoting')
              : quote
                ? quote.carrier
                  ? t('feeQuoted', { amount: formatVND(quote.feeVnd, locale), carrier: quote.carrier.carrierName }) +
                    (quote.carrier.estimatedDelivery ? ` ${t('eta', { text: quote.carrier.estimatedDelivery })}` : '')
                  : t('feeEstimated', { amount: formatVND(quote.feeVnd, locale) })
                : t('feeNeedsAddress')}
          </p>
          {!quoting && quote && quote.options.length > 1 && (
            <details>
              <summary>{t('carrierCompare', { count: quote.options.length })}</summary>
              <ul>
                {quote.options.map((option) => (
                  <li
                    key={option.carrierId}
                    className={option.carrierId === quote.carrier?.carrierId ? 'is-chosen' : ''}
                  >
                    <span>{option.carrierName}</span>
                    <span>{formatVND(option.feeVnd, locale)}</span>
                    <small>{option.estimatedDelivery}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {fulfillmentMethod === 'DIRECT_MEETING' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="payment-plan-note sm:col-span-2">{t('meetingPlaceHint')}</p>
          <label className="mu-field">
            {t('meetingDate')}
            <input
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
    </fieldset>
  );
}
