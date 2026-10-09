'use client';

import { FormEvent, useEffect, useState } from 'react';
import TextField, { inputClassName } from '@/components/FormElements/TextField';
import ContactApi from '@/core/client/api/Contact';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { ContactMessageInput } from '@/shared/types/contact';
import { useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import Link from '@/i18n/navigation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;
const emptyForm: ContactMessageInput = { name: '', email: '', phone: '', company: '', message: '' };

type ContactErrors = Partial<Record<keyof ContactMessageInput, string>>;

const Contact = () => {
  const t = useTranslations('studioContent');
  const { user } = useCurrentUser();
  const [form, setForm] = useState<ContactMessageInput>(emptyForm);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Signed-in customers do not have to type their details again.
  useEffect(() => {
    if (user) {
      setForm((current) => ({
        ...current,
        name: current.name || `${user.lastName} ${user.firstName}`.trim(),
        email: current.email || user.email,
        phone: current.phone || user.phone || '',
      }));
    }
  }, [user]);

  const update = (key: keyof ContactMessageInput) => (value: string) => setForm({ ...form, [key]: value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: ContactErrors = {};
    if (!form.name.trim()) nextErrors.name = t('nameError');
    if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = t('emailError');
    if (form.message.trim().length < MIN_MESSAGE_LENGTH) {
      nextErrors.message = t('messageError', { count: MIN_MESSAGE_LENGTH });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSending(true);
    const ok = await ContactApi.sendMessage(form);
    setSending(false);
    if (ok) {
      setSent(true);
      setForm(emptyForm);
    }
  };

  return (
    <div className="mu-wrap mu-section studio-contact">
      <div className="studio-contact-copy">
        <p className="studio-kicker">
          <AdminIcon name="support" size={17} /> MODEL UNIVERSE / {t('contactEyebrow')}
        </p>
        <h1>{t('contactTitle')}</h1>
        <p className="studio-hero-intro">{t('contactIntro')}</p>
        <Link href="/assistant" className="studio-contact-assistant">
          <AdminIcon name="spark" size={26} />
          <span>
            <strong>{t('assistantTitle')}</strong>
            <small>{t('assistantIntro')}</small>
          </span>
          <span aria-hidden="true">↗</span>
        </Link>
        <details className="service-terms mt-6">
          <summary>{t('office')}</summary>
          <div className="service-terms-content">
            <p>123 Vạn Kiếp, Phường 3, Quận Bình Thạnh, TP. Hồ Chí Minh</p>
            <a href="tel:+84373498729">+84 373 498 729</a>
            <a href="mailto:lehoangbao5678@gmail.com">lehoangbao5678@gmail.com</a>
          </div>
        </details>
      </div>

      <div className="mu-panel studio-contact-form p-6 sm:p-8">
        {sent ? (
          <div className="py-10 text-center">
            <p className="mb-2 text-2xl font-semibold" role="status">
              {t('thanks')}
            </p>
            <p className="mb-6 text-body dark:text-store-muted">{t('reply')}</p>
            <button onClick={() => setSent(false)} className="font-medium text-brand-hover hover:underline">
              {t('sendAnother')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <TextField
              label={t('name')}
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => update('name')(event.target.value)}
              error={errors.name}
            />
            <TextField
              label={t('company')}
              name="company"
              placeholder={t('optional')}
              autoComplete="organization"
              value={form.company}
              onChange={(event) => update('company')(event.target.value)}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => update('email')(event.target.value)}
              error={errors.email}
            />
            <TextField
              label={t('phone')}
              name="phone"
              type="tel"
              placeholder={t('optional')}
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => update('phone')(event.target.value)}
            />
            <div className="sm:col-span-2">
              <label htmlFor="message" className="mb-2 block text-sm font-medium text-black dark:text-white">
                {t('message')}
              </label>
              <textarea
                id="message"
                rows={5}
                maxLength={2000}
                className={`${inputClassName} ${errors.message ? 'border-danger' : ''}`}
                value={form.message}
                onChange={(event) => update('message')(event.target.value)}
              />
              {errors.message && <p className="mt-1 text-sm text-danger">{errors.message}</p>}
            </div>
            <button type="submit" disabled={sending} className="mu-button disabled:opacity-60 sm:col-span-2">
              {t(sending ? 'sending' : 'send')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Contact;
