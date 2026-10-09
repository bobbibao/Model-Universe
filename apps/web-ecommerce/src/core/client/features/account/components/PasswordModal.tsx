'use client';

import { FormEvent, useState } from 'react';
import Modal from '@/components/Modal/Modal';
import TextField from '@/components/FormElements/TextField';
import AuthApi from '@/core/client/api/Auth';
import { useTranslations } from 'next-intl';

const MIN_PASSWORD_LENGTH = 6;
const emptyForm = { oldPassword: '', newPassword: '', confirmPassword: '' };

const PasswordModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useTranslations('profile');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setForm(emptyForm);
    setError(undefined);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.oldPassword || !form.newPassword || !form.confirmPassword) {
      setError(t('completeFields'));
      return;
    }
    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t('passwordLength', { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const changed = await AuthApi.changePassword(form.oldPassword, form.newPassword, form.confirmPassword);
    setSubmitting(false);
    if (changed) close();
  };

  return (
    <Modal open={open} title={t('changePassword')} onClose={close}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t('oldPassword')}
          name="oldPassword"
          type="password"
          autoComplete="current-password"
          value={form.oldPassword}
          onChange={(event) => setForm({ ...form, oldPassword: event.target.value })}
        />
        <TextField
          label={t('newPassword')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
        />
        <TextField
          label={t('confirmPassword')}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
          error={error}
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={close} className="rounded-md px-4 py-2 font-medium text-body hover:underline">
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

export default PasswordModal;
