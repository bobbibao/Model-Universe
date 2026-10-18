'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import AddressPicker, { type AddressDraft } from '@/components/Address/AddressPicker';

interface Origin {
  name: string;
  phone: string;
  address: AddressDraft;
  requiredNote: string;
  defaultPackage: { weightGram: number; lengthCm: number; widthCm: number; heightCm: number };
  autoCreate: boolean;
}
interface Config {
  ghnConfigured: boolean;
  ghnOrderMode: 'live' | 'simulate';
  onlinePayment: boolean;
}

const EMPTY: Origin = {
  name: 'MODEL universe',
  phone: '',
  address: {},
  requiredNote: 'CHOXEMHANGKHONGTHU',
  defaultPackage: { weightGram: 1200, lengthCm: 40, widthCm: 30, heightCm: 15 },
  autoCreate: true,
};

// The shop's GHN pickup and return address (same picker as checkout), delivery note for the courier, default kit box,
// and whether a GHN order is created automatically after a verified payment.
export default function ShippingSettings() {
  const t = useTranslations('shippingSettings');
  const [origin, setOrigin] = useState<Origin>(EMPTY);
  const [config, setConfig] = useState<Config>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Api.get('/admin/shipping/origin').then((response) => {
      if (response.data.origin) setOrigin(response.data.origin);
      setConfig(response.data.config);
    });
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setOrigin((await Api.put('/admin/shipping/origin', origin)).data);
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  const box = (key: keyof Origin['defaultPackage']) => (
    <label className="mu-field" key={key}>
      {t(`package.${key}`)}
      <input
        type="number"
        min={1}
        step={1}
        required
        value={origin.defaultPackage[key]}
        onChange={(event) =>
          setOrigin({ ...origin, defaultPackage: { ...origin.defaultPackage, [key]: Number(event.target.value) } })
        }
      />
    </label>
  );
  return (
    <section className="space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mu-note">{t('intro')}</p>
        {config && (
          <p className="mu-note mt-2">
            {t('status', {
              ghn: t(config.ghnConfigured ? 'connected' : 'notConnected'),
              mode: t(`mode.${config.ghnOrderMode}`),
              payos: t(config.onlinePayment ? 'connected' : 'notConnected'),
            })}
          </p>
        )}
      </header>
      <form className="mu-panel grid gap-5 p-5 xl:grid-cols-2" onSubmit={(event) => void save(event)}>
        <div className="space-y-4">
          <label className="mu-field">
            {t('name')}
            <input
              required
              maxLength={120}
              value={origin.name}
              onChange={(event) => setOrigin({ ...origin, name: event.target.value })}
            />
          </label>
          <label className="mu-field">
            {t('phone')}
            <input
              required
              type="tel"
              value={origin.phone}
              onChange={(event) => setOrigin({ ...origin, phone: event.target.value })}
            />
          </label>
          <label className="mu-field">
            {t('requiredNote')}
            <select
              value={origin.requiredNote}
              onChange={(event) => setOrigin({ ...origin, requiredNote: event.target.value })}
            >
              {['CHOXEMHANGKHONGTHU', 'KHONGCHOXEMHANG', 'CHOTHUHANG'].map((value) => (
                <option key={value} value={value}>
                  {t(`notes.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 font-semibold">{t('packageTitle')}</legend>
            {(['weightGram', 'lengthCm', 'widthCm', 'heightCm'] as const).map(box)}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={origin.autoCreate}
              onChange={(event) => setOrigin({ ...origin, autoCreate: event.target.checked })}
            />
            {t('autoCreate')}
          </label>
        </div>
        <div className="space-y-3">
          <h2 className="font-semibold">{t('addressTitle')}</h2>
          <AddressPicker
            value={origin.address}
            onChange={(address) => setOrigin((current) => ({ ...current, address }))}
            idPrefix="origin"
          />
        </div>
        <div className="xl:col-span-2">
          <button className="mu-button" disabled={busy}>
            {t('save')}
          </button>
        </div>
      </form>
    </section>
  );
}
