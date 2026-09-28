'use client';

import React, { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}

const Modal = ({ open, title, onClose, children, footer, size = 'md' }: ModalProps) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-999999 flex items-center justify-center bg-black/60 px-4 py-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-full w-full overflow-y-auto rounded-md bg-white shadow-default dark:bg-boxdark ${
          size === 'lg' ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Đóng"
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
