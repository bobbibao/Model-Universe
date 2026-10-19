'use client';

import './calendar.css';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { dateValue, parseDateValue } from './date-values';

export default function CalendarPanel({
  value,
  min,
  max,
  withTime = false,
  onConfirm,
  onCancel,
  className = '',
  hint,
}: {
  value?: string;
  min?: string;
  max?: string;
  withTime?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  className?: string;
  hint?: string;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale() === 'en' ? 'en-GB' : 'vi-VN';
  const id = useId();
  const minDate = parseDateValue(min),
    maxDate = parseDateValue(max);
  const initial = parseDateValue(value) ?? minDate ?? new Date();
  const [day, setDay] = useState(initial);
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [yearText, setYearText] = useState(String(initial.getFullYear()));
  useEffect(() => setYearText(String(month.getFullYear())), [month]);
  const [hours, setHours] = useState(String(initial.getHours()).padStart(2, '0'));
  const [minutes, setMinutes] = useState(String(initial.getMinutes()).padStart(2, '0'));
  const panel = useRef<HTMLElement>(null);
  const now = new Date();
  const candidate = new Date(day);
  candidate.setHours(withTime ? Number(hours) : 0, withTime ? Number(minutes) : 0, 0, 0);
  const candidateValue = dateValue(candidate, withTime);
  const valid =
    (!withTime ||
      (hours !== '' &&
        minutes !== '' &&
        Number.isInteger(Number(hours)) &&
        Number.isInteger(Number(minutes)) &&
        Number(hours) >= 0 &&
        Number(hours) <= 23 &&
        Number(minutes) >= 0 &&
        Number(minutes) <= 59)) &&
    (!min || candidateValue >= min) &&
    (!max || candidateValue <= max);
  const disabledDay = (date: Date) =>
    (minDate && dateValue(date) < dateValue(minDate)) || (maxDate && dateValue(date) > dateValue(maxDate));
  const start = new Date(month);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date;
  });
  const moveMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const dayLabel = (date: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date);
  const focusDay = (date: Date) => {
    if (disabledDay(date)) return;
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    requestAnimationFrame(() => document.getElementById(`${id}-${dateValue(date)}`)?.focus());
  };
  return (
    <section
      ref={panel}
      className={`dt-calendar ${className}`}
      aria-label={t('label')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="dt-calendar-head">
        <button
          type="button"
          aria-label={t('previousMonth')}
          disabled={!!minDate && month <= new Date(minDate.getFullYear(), minDate.getMonth(), 1)}
          onClick={() => moveMonth(-1)}
        >
          ‹
        </button>
        <div className="dt-month-selectors">
          <select
            aria-label={t('month')}
            value={month.getMonth()}
            onChange={(event) => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index}>
                {new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, index, 1))}
              </option>
            ))}
          </select>
          <input
            type="number"
            aria-label={t('year')}
            min={minDate?.getFullYear() ?? 1}
            max={maxDate?.getFullYear() ?? 9999}
            value={yearText}
            onBlur={() => setYearText(String(month.getFullYear()))}
            onChange={(event) => {
              setYearText(event.target.value);
              const year = Number(event.target.value);
              if (Number.isInteger(year) && year >= 1000 && year <= 9999) setMonth(new Date(year, month.getMonth(), 1));
            }}
          />
        </div>
        <button
          type="button"
          aria-label={t('nextMonth')}
          disabled={!!maxDate && month >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)}
          onClick={() => moveMonth(1)}
        >
          ›
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
      </p>
      <div className="dt-calendar-week" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>
            {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 5 + index))}
          </span>
        ))}
      </div>
      <div className="dt-calendar-days" role="group" aria-label={t('chooseDay')}>
        {days.map((date) => (
          <button
            type="button"
            key={dateValue(date)}
            id={`${id}-${dateValue(date)}`}
            disabled={!!disabledDay(date)}
            aria-label={dayLabel(date)}
            aria-pressed={dateValue(date) === dateValue(day)}
            aria-current={dateValue(date) === dateValue(now) ? 'date' : undefined}
            className={`${date.getMonth() !== month.getMonth() ? 'is-outside' : ''}${dateValue(date) === dateValue(day) ? ' is-selected' : ''}`}
            onClick={() => setDay(date)}
            onKeyDown={(event) => {
              const offset = (
                {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7,
                  Home: -((date.getDay() + 6) % 7),
                  End: 6 - ((date.getDay() + 6) % 7),
                } as Record<string, number>
              )[event.key];
              if (offset !== undefined) {
                event.preventDefault();
                const next = new Date(date);
                next.setDate(next.getDate() + offset);
                focusDay(next);
              }
            }}
          >
            {date.getDate()}
          </button>
        ))}
      </div>
      <div className="dt-calendar-shortcuts">
        <button
          type="button"
          disabled={!!disabledDay(now)}
          onClick={() => {
            setDay(now);
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          {t('today')}
        </button>
        <span>{withTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''}</span>
      </div>
      {withTime && (
        <>
          <div className="dt-calendar-time">
            <strong>
              {t('time')} <small>24h</small>
            </strong>
            <label>
              <span className="sr-only">{t('hour')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={23}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </label>
            <span>:</span>
            <label>
              <span className="sr-only">{t('minute')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
          </div>
          <div className="dt-calendar-slots">
            {['09:00', '12:00', '18:00', '20:00'].map((time) => (
              <button
                type="button"
                key={time}
                aria-pressed={`${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}` === time}
                onClick={() => {
                  const [h, m] = time.split(':');
                  setHours(h);
                  setMinutes(m);
                }}
              >
                {time}
              </button>
            ))}
          </div>
        </>
      )}
      <p role="status" className={`dt-calendar-note${valid ? '' : ' is-invalid'}`}>
        {valid ? (hint ?? t('hint')) : t('invalid')}
      </p>
      <div className="dt-calendar-footer">
        <button type="button" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="button" className="is-primary" disabled={!valid} onClick={() => onConfirm(candidateValue)}>
          {t('confirm')}
        </button>
      </div>
    </section>
  );
}
