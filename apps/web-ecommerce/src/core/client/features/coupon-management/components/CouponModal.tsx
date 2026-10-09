'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/Modal/Modal';
import TextField, { inputClassName } from '@/components/FormElements/TextField';
import CouponApi from '@/core/client/api/Coupon';
import type { Coupon, CouponInput } from '@/shared/types/order';

type CouponForm = Omit<CouponInput, 'discountPercent' | 'usageLimit' | 'minOrderVnd'> & {
  discountPercent: string;
  usageLimit: string;
  minOrderVnd: string;
};

const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GENERATED_CODE_LENGTH = 8;

// Random code, optionally prefixed.
const generateCode = (prefix: string) =>
  `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, '')}${Array.from(
    { length: GENERATED_CODE_LENGTH },
    () => CODE_CHARACTERS[Math.floor(Math.random() * CODE_CHARACTERS.length)],
  ).join('')}`.slice(0, 30);

// yyyy-mm-dd in local time (toISOString would shift the date by the UTC offset).
const toDateInput = (value: Date | string) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const emptyForm = (): CouponForm => ({
  code: '',
  title: '',
  description: '',
  discountPercent: '10',
  usageLimit: '',
  minOrderVnd: '',
  startDate: toDateInput(new Date()),
  expirationDate: toDateInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
  isActive: true,
});

interface CouponModalProps {
  open: boolean;
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: () => void;
}

const CouponModal = ({ open, coupon, onClose, onSaved }: CouponModalProps) => {
  const t = useTranslations('adminCoupons');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const [prefix, setPrefix] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPrefix('');
    setForm(
      coupon
        ? {
            code: coupon.code,
            title: coupon.title,
            description: coupon.description || '',
            discountPercent: String(coupon.discountPercent),
            usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : '',
            minOrderVnd: coupon.minOrderVnd ? String(coupon.minOrderVnd) : '',
            startDate: toDateInput(coupon.startDate),
            expirationDate: toDateInput(coupon.expirationDate),
            isActive: coupon.isActive,
          }
        : emptyForm(),
    );
  }, [open, coupon]);

  const update = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => setForm({ ...form, [key]: value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || coupon?.source === 'loyalty') return;
    setError(null);
    const input: CouponInput = {
      ...form,
      code: form.code.trim().toUpperCase(),
      discountPercent: Number(form.discountPercent),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      minOrderVnd: form.minOrderVnd ? Number(form.minOrderVnd) : 0,
      // End of the selected day, so a coupon stays valid on its expiration date.
      expirationDate: `${form.expirationDate}T23:59:59`,
      startDate: `${form.startDate}T00:00:00`,
    };
    if (!/^[A-Z0-9_-]{3,30}$/.test(input.code) || !input.title.trim() ||
      !Number.isInteger(input.discountPercent) || input.discountPercent < 1 || input.discountPercent > 100 ||
      (input.usageLimit !== null && (!Number.isInteger(input.usageLimit) || input.usageLimit < 1)) ||
      !Number.isSafeInteger(input.minOrderVnd) || input.minOrderVnd < 0 ||
      !form.startDate || !form.expirationDate || form.startDate > form.expirationDate) {
      setError(t('invalid')); return;
    }
    setSaving(true);
    const saved = coupon ? await CouponApi.updateCoupon(coupon.id, input) : await CouponApi.createCoupon(input);
    setSaving(false);
    if (saved) onSaved();
    else setError(t('saveError'));
  };

  return (
    <Modal open={open} title={coupon ? t('editTitle') : t('createTitle')} onClose={onClose} size="lg">
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <TextField
            label={t('code')}
            name="code"
            className="uppercase"
            value={form.code}
            onChange={(event) => update('code', event.target.value.toUpperCase())}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <input
              className={`${inputClassName} !w-40 !py-1.5`}
              placeholder={t('prefix')}
              aria-label={t('prefix')}
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
            />
            <button
              type="button"
              onClick={() => update('code', generateCode(prefix))}
              className="rounded-md bg-gray px-3 py-1.5 font-medium text-black hover:opacity-90 dark:bg-meta-4 dark:text-white"
            >
              {t('generate')}
            </button>
          </div>
        </div>
        <TextField
          label={t('title')}
          name="title"
          className="sm:col-span-2"
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
        />
        <TextField
          label={t('description')}
          name="description"
          className="sm:col-span-2"
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
        />
        <TextField
          label={t('percent')}
          name="discountPercent"
          inputMode="numeric"
          value={form.discountPercent}
          onChange={(event) => update('discountPercent', event.target.value.replace(/\D/g, ''))}
        />
        <TextField
          label={t('usageInput')}
          name="usageLimit"
          inputMode="numeric"
          value={form.usageLimit}
          onChange={(event) => update('usageLimit', event.target.value.replace(/\D/g, ''))}
        />
        <TextField
          label={t('minimumInput')}
          name="minOrderVnd"
          inputMode="numeric"
          className="sm:col-span-2"
          value={form.minOrderVnd}
          onChange={(event) => update('minOrderVnd', event.target.value.replace(/\D/g, ''))}
        />
        <TextField
          label={t('start')}
          name="startDate"
          type="date"
          value={form.startDate}
          onChange={(event) => update('startDate', event.target.value)}
        />
        <TextField
          label={t('expiry')}
          name="expirationDate"
          type="date"
          value={form.expirationDate}
          onChange={(event) => update('expirationDate', event.target.value)}
        />
        <label className="flex items-center gap-3 font-medium text-black dark:text-white sm:col-span-2">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-hover"
            checked={form.isActive}
            onChange={(event) => update('isActive', event.target.checked)}
          />
          {t('active')}
        </label>
        {error && <p role="alert" className="text-danger sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-3 sm:col-span-2">
          <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-body hover:underline">
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CouponModal;
