'use client';

import React, { useState } from 'react';
import Modal from './Modal';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

const ConfirmModal = ({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) => {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-md px-4 py-2 font-medium text-body hover:underline">
            Huỷ
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={`rounded-md px-4 py-2 font-semibold disabled:opacity-60 ${
              danger ? 'bg-danger text-white hover:opacity-90' : 'bg-brand text-brand-ink hover:bg-brand-hover'
            }`}
          >
            {submitting ? 'Đang xử lý...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-black dark:text-bodydark1">{message}</div>
    </Modal>
  );
};

export default ConfirmModal;
