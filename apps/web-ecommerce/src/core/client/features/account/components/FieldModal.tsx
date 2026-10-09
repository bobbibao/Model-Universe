'use client';

import { FormEvent, useEffect, useState } from 'react';
import Modal from '@/components/Modal/Modal';
import TextField from '@/components/FormElements/TextField';
import { useTranslations } from 'next-intl';

interface FieldModalProps {
  open: boolean;
  label: string;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => Promise<boolean>;
}

// Edits a single profile field.
const FieldModal = ({ open, label, initialValue, onClose, onSave }: FieldModalProps) => {
  const t = useTranslations('profile');
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(undefined);
    }
  }, [open, initialValue]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setError(t('required', { field: label }));
      return;
    }
    setSubmitting(true);
    const saved = await onSave(value.trim());
    setSubmitting(false);
    if (saved) onClose();
  };

  return (
    <Modal open={open} title={t('updateField', { field: label })} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={label}
          name="value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 font-medium text-body hover:underline"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {submitting ? t('updating') : t('update')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default FieldModal;
