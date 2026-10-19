'use client';

import { useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export default function SchedulePicker({
  value,
  onChange,
  isPost,
}: {
  value?: string;
  onChange: (value?: string) => void;
  isPost: boolean;
}) {
  const t = useTranslations('marketingStudio.calendar');
  const locale = useLocale() === 'en' ? 'en-GB' : 'vi-VN';
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date());
  const [hours, setHours] = useState('09');
  const [minutes, setMinutes] = useState('00');
  const now = new Date();
  const minimum = new Date(now.getTime() + (isPost ? 10 : 0) * 60000);
  const maximum = new Date(now.getTime() + 30 * 86400000);
  const candidate = new Date(draft);
  candidate.setHours(Number(hours), Number(minutes), 0, 0);
  const validTime =
    hours !== '' &&
    minutes !== '' &&
    Number(hours) >= 0 &&
    Number(hours) <= 23 &&
    Number(minutes) >= 0 &&
    Number(minutes) <= 59 &&
    Number.isInteger(Number(hours)) &&
    Number.isInteger(Number(minutes));
  const valid = validTime && candidate >= minimum && candidate <= maximum;
  const format = (date: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  const openPicker = () => {
    if (!open) {
      const saved = value ? new Date(value) : null;
      const initial =
        saved && saved >= minimum && saved <= maximum
          ? saved
          : new Date(Math.ceil((minimum.getTime() + 60000) / 300000) * 300000);
      setDraft(initial);
      setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
      setHours(String(initial.getHours()).padStart(2, '0'));
      setMinutes(String(initial.getMinutes()).padStart(2, '0'));
    }
    setOpen(!open);
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const dates = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
  const disabledDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const begin = new Date(date);
    begin.setHours(0, 0, 0, 0);
    return end < minimum || begin > maximum;
  };
  const moveMonth = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  const quick = (kind: 'hour' | 'tomorrow') => {
    const date = new Date();
    if (kind === 'hour') {
      date.setTime(date.getTime() + 3600000);
      date.setSeconds(0, 0);
    } else {
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
    }
    onChange(date.toISOString());
    setOpen(false);
  };
  return (
    <div className="mk-date-picker">
      <div className="mk-date-presets">
        <button
          type="button"
          className={!value ? 'is-selected' : ''}
          onClick={() => {
            onChange(undefined);
            setOpen(false);
          }}
        >
          {t('now')}
        </button>
        <button type="button" onClick={() => quick('hour')}>
          {t('inOneHour')}
        </button>
        <button type="button" onClick={() => quick('tomorrow')}>
          {t('tomorrow')}
        </button>
      </div>
      <button
        ref={trigger}
        type="button"
        className={`mk-date-trigger${value ? ' has-value' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={openPicker}
      >
        <span className="mk-date-icon">
          <AdminIcon name="calendar" size={22} />
        </span>
        <span>
          <small>{t('label')}</small>
          <strong>{value ? format(new Date(value)) : t('choose')}</strong>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <section
          id={id}
          className="mk-calendar"
          aria-label={t('label')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <div className="mk-calendar-head">
            <button
              type="button"
              className="mk-icon-button"
              aria-label={t('previousMonth')}
              disabled={month.getFullYear() === minimum.getFullYear() && month.getMonth() === minimum.getMonth()}
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>
            <strong aria-live="polite">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
            </strong>
            <button
              type="button"
              className="mk-icon-button"
              aria-label={t('nextMonth')}
              disabled={month.getFullYear() === maximum.getFullYear() && month.getMonth() === maximum.getMonth()}
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
          </div>
          <div className="mk-calendar-week" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index}>
                {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 5 + index))}
              </span>
            ))}
          </div>
          <div className="mk-calendar-days" role="group" aria-label={t('chooseDay')}>
            {dates.map((date) => (
              <button
                key={dayKey(date)}
                id={`${id}-${dayKey(date)}`}
                type="button"
                disabled={disabledDay(date)}
                aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)}
                aria-pressed={sameDay(date, draft)}
                aria-current={sameDay(date, now) ? 'date' : undefined}
                className={`${date.getMonth() !== month.getMonth() ? 'is-outside' : ''}${sameDay(date, draft) ? ' is-selected' : ''}`}
                onClick={() => setDraft(date)}
                onKeyDown={(event) => {
                  const offset = (
                    { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>
                  )[event.key];
                  if (offset === undefined) return;
                  event.preventDefault();
                  const next = new Date(date);
                  next.setDate(next.getDate() + offset);
                  document.getElementById(`${id}-${dayKey(next)}`)?.focus();
                }}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
          <div className="mk-calendar-time">
            <div>
              <strong>{t('time')}</strong>
              <small>{Intl.DateTimeFormat().resolvedOptions().timeZone} · 24h</small>
            </div>
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
            <span aria-hidden="true">:</span>
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
          <div className="mk-calendar-slots">
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
          <p className={`mk-calendar-note${valid ? '' : ' is-invalid'}`} role="status">
            {valid ? t('rangeHint', { minutes: isPost ? 10 : 0 }) : t('invalid', { minutes: isPost ? 10 : 0 })}
          </p>
          <div className="mk-calendar-footer">
            <button type="button" className="mk-button" onClick={() => setOpen(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="mk-button is-primary"
              disabled={!valid}
              onClick={() => {
                onChange(candidate.toISOString());
                setOpen(false);
              }}
            >
              {t('confirm')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
