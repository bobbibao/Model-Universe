'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Modal from './Modal';
import {
  CANCEL_NOTE_MAX,
  CANCEL_NOTE_MIN,
  CUSTOMER_CANCEL_REASONS,
  STAFF_CANCEL_REASONS,
} from '@/shared/cancellation';

// Cancelling an order always records why (src/shared/cancellation.ts): a reason from the list, and a note that is
// required for "other". `notice` explains what happens next (e.g. a paid order becomes a request).
export default function CancelOrderModal({
  open,
  audience,
  title,
  notice,
  initialReason,
  initialNote,
  onConfirm,
  onClose,
}: {
  open: boolean;
  audience: 'customer' | 'staff';
  title: string;
  notice?: string;
  initialReason?: string;
  initialNote?: string;
  onConfirm: (input: { reason: string; note?: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations('cancellation'),
    common = useTranslations('common');
  const reasons = audience === 'customer' ? CUSTOMER_CANCEL_REASONS : STAFF_CANCEL_REASONS;
  const [reason, setReason] = useState(initialReason || '');
  const [note, setNote] = useState(initialNote || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason(initialReason || '');
      setNote(initialNote || '');
    }
  }, [open, initialReason, initialNote]);
  const noteRequired = reason === 'other';
  const valid =
    !!reason && note.trim().length <= CANCEL_NOTE_MAX && (!noteRequired || note.trim().length >= CANCEL_NOTE_MIN);
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (await onConfirm({ reason, note: note.trim() || undefined })) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-md px-4 py-2 font-medium text-body hover:underline">
            {t('keep')}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!valid || busy}
            className="rounded-md bg-danger px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? common('processing') : t('confirm')}
          </button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">{t('reasonTitle')}</legend>
        {reasons.map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="cancel-reason"
              className="mt-1"
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {t(`reasons.${value}`)}
          </label>
        ))}
      </fieldset>
      <label className="mu-field mt-4">
        {t(noteRequired ? 'noteRequired' : 'note')}
        <textarea
          rows={3}
          maxLength={CANCEL_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={noteRequired && note.trim().length < CANCEL_NOTE_MIN}
        />
      </label>
      {notice && <p className="mu-note mt-3 text-sm">{notice}</p>}
    </Modal>
  );
}
