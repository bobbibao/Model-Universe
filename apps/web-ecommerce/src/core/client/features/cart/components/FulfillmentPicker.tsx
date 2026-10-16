'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { formatVND } from '@/shared/server/utils/utils';
import { MEETING_SLOTS, vnDate, type FulfillmentMethod, type MeetingSlot } from '@/shared/fulfillment';

// Checkout delivery choice (docs/business/deposit-delivery-specification.md): SPX with the balance collected on
// delivery, or an in-person handover at a place and time the shop confirms. The address fields above are the
// recipient address for SPX, or the proposed handover place.
export default function FulfillmentPicker({ estimatedFeeVnd }: { estimatedFeeVnd: number }) {
  const t = useTranslations('fulfillment'),
    locale = useLocale();
  const { fulfillmentMethod, setFulfillmentMethod, meeting, setMeeting, shippingFeeOnDelivery, setShippingFeeOnDelivery } =
    useCheckoutDraft();
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
  const today = vnDate();
  return (
    <fieldset className="payment-plan">
      <legend>{t('method.title')}</legend>
      {option('SPX_COD')}
      {option('DIRECT_MEETING')}
      {fulfillmentMethod === 'SPX_COD' && (
        <div className="space-y-2 text-sm">
          <p>{t('feeEstimate', { amount: formatVND(estimatedFeeVnd, locale) })}</p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={shippingFeeOnDelivery}
              onChange={(event) => setShippingFeeOnDelivery(event.target.checked)}
            />
            {t('feeOnDelivery')}
          </label>
          <p className="payment-plan-note">{t('feeOnDeliveryHint')}</p>
        </div>
      )}
      {fulfillmentMethod === 'DIRECT_MEETING' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="payment-plan-note sm:col-span-2">{t('meetingPlaceHint')}</p>
          <label className="mu-field">
            {t('meetingDate')}
            <input
              type="date"
              min={today}
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
