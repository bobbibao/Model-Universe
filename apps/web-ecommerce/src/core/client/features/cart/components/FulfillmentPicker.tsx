'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { formatVND } from '@/shared/server/utils/utils';
import { MEETING_SLOTS, vnDate, type FulfillmentMethod, type MeetingSlot } from '@/shared/fulfillment';

export interface FeeQuote {
  feeVnd: number;
  expectedDeliveryTime: string | null;
  source: 'ghn' | 'estimate';
}

// Checkout delivery choice (docs/business/deposit-delivery-specification.md): GHN delivery with the rest collected on
// delivery (the GHN fee is quoted for the address and added to the order), or an in-person handover at a place and
// time the shop confirms.
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
        <p className="text-sm" aria-live="polite">
          {quoting
            ? t('feeQuoting')
            : quote
              ? t('feeQuoted', { amount: formatVND(quote.feeVnd, locale) }) +
                (quote.expectedDeliveryTime
                  ? ` ${t('eta', { date: new Date(quote.expectedDeliveryTime).toLocaleDateString(locale) })}`
                  : '')
              : t('feeNeedsAddress')}
        </p>
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
