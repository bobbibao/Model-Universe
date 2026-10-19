'use client';

import { useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import CalendarPanel from '@/components/DateTimeInput/CalendarPanel';
import { dateValue } from '@/components/DateTimeInput/date-values';
import AdminIcon from '@/components/Admin/AdminIcon';

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
  const now = new Date();
  const minimum = new Date(now.getTime() + (isPost ? 10 : 0) * 60000);
  const maximum = new Date(now.getTime() + 30 * 86400000);
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
    }
    setOpen(!open);
  };
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
        <CalendarPanel
          className="mk-calendar"
          value={dateValue(draft, true)}
          min={dateValue(minimum, true)}
          max={dateValue(maximum, true)}
          withTime
          onCancel={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
          onConfirm={(value) => {
            onChange(new Date(value).toISOString());
            setOpen(false);
            trigger.current?.focus();
          }}
          hint={t('rangeHint', { minutes: isPost ? 10 : 0 })}
        />
      )}
    </div>
  );
}
