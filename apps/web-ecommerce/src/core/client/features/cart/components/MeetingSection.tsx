'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import TextField from '@/components/FormElements/TextField';
import AdminIcon from '@/components/Admin/AdminIcon';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { MEETING_SLOTS, vnDate } from '@/shared/fulfillment';
import type { ShippingInfo } from '@/shared/types/order';
import type { ShippingErrors } from './CheckoutForm';

export interface Showroom {
  name: string;
  address: string;
  city: string;
  phone: string | null;
  openingHours: string | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const showroomMapUrl = (showroom: Showroom) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    showroom.latitude && showroom.longitude
      ? `${showroom.latitude},${showroom.longitude}`
      : `${showroom.address}, ${showroom.city}`,
  )}`;

// The shop's address as a card: where to come, when it is open, how to call, and directions.
export function ShowroomCard({ showroom }: { showroom: Showroom }) {
  const t = useTranslations('meeting');
  return (
    <div className="showroom-card">
      <span className="delivery-address-icon">
        <AdminIcon name="pin" size={18} />
      </span>
      <div className="showroom-card-text">
        <strong>{showroom.name}</strong>
        <span>
          {showroom.address}
          {showroom.address.includes(showroom.city) ? '' : `, ${showroom.city}`}
        </span>
        {(showroom.openingHours || showroom.phone) && (
          <small>{[showroom.openingHours, showroom.phone].filter(Boolean).join(' · ')}</small>
        )}
        {showroom.directions && <small>{showroom.directions}</small>}
      </div>
      <div className="showroom-card-actions">
        <a className="delivery-address-change" href={showroomMapUrl(showroom)} target="_blank" rel="noreferrer">
          {t('directions')}
        </a>
        {showroom.phone && (
          <a className="showroom-call" href={`tel:${showroom.phone.replace(/\s+/g, '')}`}>
            {t('call')}
          </a>
        )}
      </div>
    </div>
  );
}

// "Gặp trực tiếp" at checkout: the customer comes to the shop to see the model before taking it. The deposit holds the
// model for them until the appointment; there is no shipping fee; they pay the rest at the shop. Shows the shop's
// address, how it works, the day and time they plan to come, and their contact details.
export default function MeetingSection({
  shipping,
  errors,
  onShippingChange,
  onShowroom,
}: {
  shipping: ShippingInfo;
  errors: ShippingErrors;
  onShippingChange: (shipping: ShippingInfo) => void;
  onShowroom: (showroom: Showroom | null) => void;
}) {
  const t = useTranslations('meeting'),
    checkout = useTranslations('checkout'),
    fulfillment = useTranslations('fulfillment');
  const { meeting, setMeeting } = useCheckoutDraft();
  const [showroom, setShowroom] = useState<Showroom | null | undefined>(undefined);
  useEffect(() => {
    void Api.get('/shipping/showroom')
      .then((response) => {
        setShowroom(response.data ?? null);
        onShowroom(response.data ?? null);
      })
      .catch(() => setShowroom(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const contact = (key: 'recipientName' | 'phone') => ({
    name: key,
    value: shipping[key],
    error: errors[key] ? checkout(`validation.${errors[key]}`) : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onShippingChange({ ...shipping, [key]: event.target.value }),
  });

  return (
    <div className="meeting-section">
      {showroom === undefined ? (
        <p className="delivery-address-loading">{t('loading')}</p>
      ) : showroom ? (
        <ShowroomCard showroom={showroom} />
      ) : (
        <p className="prepayment-warning text-sm">{t('noShowroom')}</p>
      )}

      <ol className="meeting-steps">
        {(['hold', 'visit', 'pay'] as const).map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            <div>
              <strong>{t(`steps.${step}.title`)}</strong>
              <small>{t(`steps.${step}.text`)}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="meeting-perks">
        <span>{t('freeShipping')}</span>
        <span>{t('cancelPolicy')}</span>
      </p>

      <fieldset className="meeting-when">
        <legend>{t('when')}</legend>
        <input
          type="date"
          aria-label={fulfillment('meetingDate')}
          min={vnDate()}
          required
          value={meeting.date}
          onChange={(event) => setMeeting({ ...meeting, date: event.target.value })}
        />
        <div className="meeting-slots" role="radiogroup" aria-label={fulfillment('meetingSlot')}>
          {MEETING_SLOTS.map((slot) => (
            <label key={slot} className={meeting.slot === slot ? 'is-selected' : ''}>
              <input
                type="radio"
                name="meeting-slot"
                checked={meeting.slot === slot}
                onChange={() => setMeeting({ ...meeting, slot })}
              />
              {fulfillment(`slots.${slot}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label={t('yourName')} autoComplete="name" {...contact('recipientName')} />
        <TextField label={checkout('phone')} type="tel" autoComplete="tel" {...contact('phone')} />
      </div>
      <TextField
        label={checkout('messageToShop')}
        placeholder={t('notePlaceholder')}
        name="note"
        value={shipping.note}
        maxLength={300}
        onChange={(event) => onShippingChange({ ...shipping, note: event.target.value })}
      />
    </div>
  );
}
