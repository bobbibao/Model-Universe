'use client';

import React, { useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface ModalProps {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  keepMounted?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

const Modal = ({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  keepMounted = false,
  returnFocusRef,
}: ModalProps) => {
  const t = useTranslations('common');
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = returnFocusRef?.current || (document.activeElement as HTMLElement | null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] || dialog.current)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const controls = focusable(),
        first = controls[0],
        last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.current?.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open && !keepMounted) return null;

  return (
    <div
      hidden={!open}
      className={`admin-modal-overlay fixed inset-0 z-999999 items-center justify-center bg-black/60 px-4 py-6 ${open ? 'flex' : 'hidden'}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialog}
        tabIndex={-1}
        className={`admin-modal max-h-full w-full overflow-y-auto rounded-md bg-white shadow-default dark:bg-boxdark ${
          size === 'lg' ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 id={titleId} className="text-lg font-semibold text-black dark:text-white">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="text-2xl leading-none text-body hover:text-black dark:hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-stroke px-6 py-4 dark:border-strokedark">{footer}</div>
        )}
      </div>
    </div>
  );
};

export default Modal;
