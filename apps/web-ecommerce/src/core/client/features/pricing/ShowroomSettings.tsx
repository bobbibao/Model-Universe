'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Api from '@/core/client/api/Api';
import type { Showroom } from '@/core/client/features/cart/components/MeetingSection';

const EMPTY: Showroom = {
  name: '',
  address: '',
  city: '',
  phone: null,
  openingHours: null,
  directions: null,
  latitude: null,
  longitude: null,
};
const TEXT_FIELDS = ['name', 'address', 'city', 'phone', 'openingHours', 'directions'] as const;

// The shop address customers come to for "Gặp trực tiếp" (see and collect in person), shown at checkout and on their
// order. Until it is saved, the SuperAI pickup warehouse is used.
export default function ShowroomSettings() {
  const t = useTranslations('showroomSettings');
  const [showroom, setShowroom] = useState<Showroom>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Api.get('/admin/shipping/showroom')
      .then((response) => response.data && setShowroom(response.data))
      .catch(() => undefined);
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setShowroom((await Api.put('/admin/shipping/showroom', showroom)).data);
      toast.success(t('saved'));
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mu-panel space-y-4 p-5" onSubmit={(event) => void save(event)}>
      <header>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mu-note">{t('intro')}</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <label
            key={field}
            className={`mu-field${field === 'address' || field === 'directions' ? ' sm:col-span-2' : ''}`}
          >
            {t(`field.${field}`)}
            <input
              required={['name', 'address', 'city'].includes(field)}
              maxLength={field === 'directions' ? 500 : 255}
              value={showroom[field] ?? ''}
              onChange={(event) => setShowroom({ ...showroom, [field]: event.target.value })}
            />
          </label>
        ))}
        {(['latitude', 'longitude'] as const).map((field) => (
          <label key={field} className="mu-field">
            {t(`field.${field}`)}
            <input
              type="number"
              step="any"
              value={showroom[field] ?? ''}
              onChange={(event) =>
                setShowroom({ ...showroom, [field]: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <button className="mu-button" disabled={busy}>
        {t('save')}
      </button>
    </form>
  );
}
