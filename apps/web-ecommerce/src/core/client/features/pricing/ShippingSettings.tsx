'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Api from '@/core/client/api/Api';

interface Origin {
  warehouseCode: string;
  warehouseName?: string;
  address?: string;
  viewConfig: '1' | '2' | '3';
  defaultPackage: { weightGram: number; lengthCm: number; widthCm: number; heightCm: number };
  autoCreate: boolean;
}
interface Warehouse {
  code: string;
  name: string;
  formattedAddress: string;
  active: boolean;
  primary: boolean;
}
interface Config {
  superAiConfigured: boolean;
  orderMode: 'live' | 'simulate';
  onlinePayment: boolean;
  codLimitVnd: number;
}
interface Webhook {
  registered: string | null;
  expected: string | null;
}

const EMPTY: Origin = {
  warehouseCode: '',
  viewConfig: '1',
  defaultPackage: { weightGram: 1200, lengthCm: 40, widthCm: 30, heightCm: 15 },
  autoCreate: true,
};

// SuperAI delivery settings: the pickup warehouse (managed in the SuperAI portal), whether the receiver may look at or
// try the parcel, the default kit box, automatic waybills after payment, and the status webhook.
export default function ShippingSettings() {
  const t = useTranslations('shippingSettings');
  const [origin, setOrigin] = useState<Origin>(EMPTY);
  const [config, setConfig] = useState<Config>();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [webhook, setWebhook] = useState<Webhook>();
  const [busy, setBusy] = useState(false);
  const load = () =>
    void Api.get('/admin/shipping/origin').then((response) => {
      const data = response.data as {
        origin: Origin | null;
        config: Config;
        warehouses: Warehouse[];
        webhook: Webhook;
      };
      const active = data.warehouses.filter((row) => row.active);
      setWarehouses(active);
      setOrigin(
        data.origin ?? {
          ...EMPTY,
          warehouseCode: (active.find((row) => row.primary) ?? active[0])?.code ?? '',
        },
      );
      setConfig(data.config);
      setWebhook(data.webhook);
    });
  useEffect(load, []);
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
  const registerWebhook = async () => {
    setBusy(true);
    try {
      await Api.post('/admin/shipping/superai/webhook', {});
      toast.success(t('webhookRegistered'));
      load();
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
              superai: t(config.superAiConfigured ? 'connected' : 'notConnected'),
              mode: t(`mode.${config.orderMode}`),
              payos: t(config.onlinePayment ? 'connected' : 'notConnected'),
            })}
          </p>
        )}
      </header>
      <form className="mu-panel grid gap-5 p-5 xl:grid-cols-2" onSubmit={(event) => void save(event)}>
        <div className="space-y-4">
          <label className="mu-field">
            {t('warehouse')}
            <select
              required
              value={origin.warehouseCode}
              onChange={(event) => setOrigin({ ...origin, warehouseCode: event.target.value })}
            >
              <option value="" disabled>
                {t('chooseWarehouse')}
              </option>
              {warehouses.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name} · {row.formattedAddress}
                </option>
              ))}
            </select>
          </label>
          {!warehouses.length && <p className="mu-note">{t('noWarehouses')}</p>}
          <label className="mu-field">
            {t('viewConfig')}
            <select
              value={origin.viewConfig}
              onChange={(event) => setOrigin({ ...origin, viewConfig: event.target.value as Origin['viewConfig'] })}
            >
              {(['1', '2', '3'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`viewConfigs.${value}`)}
                </option>
              ))}
            </select>
          </label>
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
        <fieldset className="grid grid-cols-2 content-start gap-3">
          <legend className="mb-2 font-semibold">{t('packageTitle')}</legend>
          {(['weightGram', 'lengthCm', 'widthCm', 'heightCm'] as const).map(box)}
          <p className="mu-note col-span-2">{t('packageNote')}</p>
        </fieldset>
        <div className="xl:col-span-2">
          <button className="mu-button" disabled={busy}>
            {t('save')}
          </button>
        </div>
      </form>
      {config?.superAiConfigured && webhook && (
        <section className="mu-panel space-y-2 p-5">
          <h2 className="font-semibold">{t('webhookTitle')}</h2>
          <p className="mu-note">{t('webhookIntro')}</p>
          <p className="text-sm">
            {t('webhookCurrent')}: <code className="break-all">{webhook.registered || t('webhookNone')}</code>
          </p>
          {webhook.expected ? (
            <>
              <p className="text-sm">
                {t('webhookExpected')}: <code className="break-all">{webhook.expected}</code>
              </p>
              <button
                type="button"
                className="mu-button-secondary"
                disabled={busy}
                onClick={() => void registerWebhook()}
              >
                {t('webhookRegister')}
              </button>
            </>
          ) : (
            <p className="mu-note">{t('webhookUnavailable')}</p>
          )}
        </section>
      )}
    </section>
  );
}
