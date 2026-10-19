'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react';
import { useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import CalendarPanel from './CalendarPanel';
import { parseDateValue } from './date-values';

/** Keeps native FormData, required validation and existing onChange handlers, with a shared calendar in the top layer. */
const DateTimeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function DateTimeInput(
  {
    type = 'date',
    value,
    defaultValue,
    onChange,
    onFocus,
    onClick,
    min,
    max,
    disabled,
    readOnly,
    className = '',
    id,
    ...props
  },
  forwardedRef,
) {
  const t = useTranslations('calendar');
  const generatedId = useId(),
    panelId = useId();
  const input = useRef<HTMLInputElement>(null),
    popup = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useImperativeHandle(forwardedRef, () => input.current!);
  const [text, setText] = useState(String(value ?? defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const withTime = type === 'datetime-local';
  const minimum = min === undefined ? undefined : String(min),
    maximum = max === undefined ? undefined : String(max);
  useEffect(() => {
    if (value !== undefined) setText(String(value));
  }, [value]);
  useEffect(() => {
    const element = input.current;
    const reset = () => {
      if (value !== undefined) return;
      const initial = String(defaultValue ?? '');
      if (element) element.defaultValue = initial;
      setText(initial);
    };
    const form = element?.form;
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [value, defaultValue]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open]);
  useEffect(() => {
    input.current?.setCustomValidity(
      text && (!parseDateValue(text) || (minimum && text < minimum) || (maximum && text > maximum)) ? t('invalid') : '',
    );
  }, [text, minimum, maximum, t]);
  useLayoutEffect(() => {
    if (open && popup.current && input.current) {
      popup.current.showPopover();
      const box = popup.current.getBoundingClientRect();
      const anchor = input.current.getBoundingClientRect();
      const below = anchor.bottom + 8;
      const above = anchor.top - box.height - 8;
      setPosition({
        left: Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12)),
        top:
          below + box.height <= innerHeight - 12
            ? below
            : above >= 12
              ? above
              : Math.max(12, innerHeight - box.height - 12),
      });
    } else popup.current?.hidePopover();
  }, [open]);
  const show = () => {
    if (disabled || readOnly) return;
    const rect = input.current!.getBoundingClientRect(),
      height = withTime ? 540 : 430,
      width = Math.min(360, innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
      top: Math.max(12, Math.min(rect.bottom + 8, innerHeight - Math.min(height, innerHeight - 24) - 12)),
    });
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const select = (next: string) => {
    setText(next);
    if (input.current) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input.current, next);
      const event = new Event('change', { bubbles: true });
      Object.defineProperties(event, { target: { value: input.current }, currentTarget: { value: input.current } });
      onChange?.(event as unknown as ChangeEvent<HTMLInputElement>);
    }
    close();
  };
  return (
    <div className="dt-input-control">
      <input
        {...props}
        ref={input}
        id={id ?? generatedId}
        type="text"
        className={`dt-value ${className}`}
        placeholder={props.placeholder ?? (withTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD')}
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        autoComplete="off"
        onFocus={onFocus}
        onClick={onClick}
        onChange={(event) => {
          setText(event.target.value);
          onChange?.(event);
        }}
        onInvalid={(event) => {
          if (!disabled && !readOnly) {
            event.preventDefault();
            show();
          }
        }}
      />
      <button
        ref={trigger}
        type="button"
        className="dt-open"
        aria-label={t('open')}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled || readOnly}
        onClick={() => (open ? close() : show())}
      >
        <AdminIcon name="calendar" size={19} />
      </button>
      <div
        id={panelId}
        ref={popup}
        popover="auto"
        className="dt-popover"
        style={position}
        onToggle={(event) => {
          if (event.newState === 'closed') setOpen(false);
        }}
      >
        {open && (
          <CalendarPanel
            value={text}
            min={minimum}
            max={maximum}
            withTime={withTime}
            onConfirm={select}
            onCancel={close}
          />
        )}
      </div>
    </div>
  );
});
export default DateTimeInput;
