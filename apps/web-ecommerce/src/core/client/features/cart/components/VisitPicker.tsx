'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import {
  DEFAULT_MEETING_LEAD_HOURS,
  MEETING_SLOTS,
  isMeetingSlotOpen,
  openMeetingDays,
  vnDate,
} from '@/shared/fulfillment';

const DAY_CHIPS = 7;

// When the customer comes to the shop, the way delivery apps let you book a slot: the next open days as chips (today
// and tomorrow named) and the time slots of the chosen day; sooner visits are arranged by phone (`phone`). Only slots the shop
// can prepare for in time (`leadHours`) are offered; the server checks the same rule.
export default function VisitPicker({
  leadHours = DEFAULT_MEETING_LEAD_HOURS,
  phone,
  mapUrl,
}: {
  leadHours?: number;
  phone?: string | null;
  mapUrl?: string;
}) {
  const t = useTranslations('meeting'),
    fulfillment = useTranslations('fulfillment'),
    locale = useLocale();
  const { meeting, setMeeting } = useCheckoutDraft();
  const days = openMeetingDays(DAY_CHIPS, leadHours);
  const first = days[0] ?? vnDate();
  const openSlots = (date: string) => MEETING_SLOTS.filter((slot) => isMeetingSlotOpen(date, slot, leadHours));

  // Keep the draft on a slot the shop can still prepare for: the first open one by default.
  useEffect(() => {
    const date = meeting.date && meeting.date >= first && openSlots(meeting.date).length ? meeting.date : first;
    const slots = openSlots(date);
    const slot = slots.includes(meeting.slot) ? meeting.slot : slots[0];
    if (slot && (date !== meeting.date || slot !== meeting.slot)) setMeeting({ date, slot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.date, meeting.slot, first, leadHours]);

  const today = vnDate(),
    tomorrow = vnDate(new Date(Date.now() + 86_400_000));
  const chip = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN', {
      weekday: 'short',
      timeZone: 'UTC',
    });
    return {
      top: date === today ? t('today') : date === tomorrow ? t('tomorrow') : weekday,
      bottom: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
    };
  };
  const chips = days.includes(meeting.date) || !meeting.date ? days : [...days.slice(0, DAY_CHIPS - 1), meeting.date];

  return (
    <fieldset className="meeting-when">
      <legend>{t('when')}</legend>
      <div className="visit-days" role="radiogroup" aria-label={fulfillment('meetingDate')}>
        {chips.map((date) => {
          const label = chip(date);
          return (
            <button
              key={date}
              type="button"
              role="radio"
              aria-checked={meeting.date === date}
              className={meeting.date === date ? 'is-selected' : ''}
              onClick={() => {
                setMeeting({ date, slot: openSlots(date).includes(meeting.slot) ? meeting.slot : openSlots(date)[0] });
              }}
            >
              <small>{label.top}</small>
              <strong>{label.bottom}</strong>
            </button>
          );
        })}
      </div>
      <div className="meeting-slots" role="radiogroup" aria-label={fulfillment('meetingSlot')}>
        {MEETING_SLOTS.map((slot) => {
          const open = !!meeting.date && isMeetingSlotOpen(meeting.date, slot, leadHours);
          return (
            <label
              key={slot}
              className={`${meeting.slot === slot ? 'is-selected' : ''}${open ? '' : ' is-disabled'}`}
              title={open ? undefined : t('slotFull')}
            >
              <input
                type="radio"
                name="meeting-slot"
                disabled={!open}
                checked={meeting.slot === slot}
                onChange={() => setMeeting({ ...meeting, slot })}
              />
              {fulfillment(`slots.${slot}`)}
            </label>
          );
        })}
      </div>
      <p className="visit-note">
        {t('leadNote', { hours: leadHours, first: `${chip(first).top} ${chip(first).bottom}` })}
      </p>
      {phone && (
        <div className="visit-sooner">
          <div>
            <strong>{t('soonerTitle')}</strong>
            <span>{t('soonerText')}</span>
          </div>
          <a className="visit-call" href={`tel:${phone.replace(/[^0-9+]/g, '')}`}>
            {t('callNow', { phone })}
          </a>
          {mapUrl && (
            <a className="visit-map" href={mapUrl} target="_blank" rel="noreferrer">
              {t('directions')}
            </a>
          )}
        </div>
      )}
    </fieldset>
  );
}
