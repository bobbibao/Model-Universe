'use client';

import { useId, useState } from 'react';
import { useLocale } from 'next-intl';
import { inputClassName } from '@/components/FormElements/TextField';

export default function PasswordField({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  const generated = useId();
  const id = props.id || props.name || generated;
  const en = useLocale() === 'en';
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-black dark:text-white">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={visible ? 'text' : 'password'}
          className={`${inputClassName} !rounded-xl !pr-20 ${error ? '!border-danger' : ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : props['aria-describedby']}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-pressed={visible}
          aria-controls={id}
          aria-label={visible ? (en ? 'Hide password' : 'Ẩn mật khẩu') : en ? 'Show password' : 'Hiện mật khẩu'}
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-body hover:bg-gray focus-visible:outline focus-visible:outline-brand-hover dark:text-store-muted dark:hover:bg-store-card"
        >
          {visible ? (en ? 'Hide' : 'Ẩn') : en ? 'Show' : 'Hiện'}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
