'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Api from '@/core/client/api/Api';
import {
  SUPERAI_CARRIERS,
  type CarrierParcelRule,
  type GradePackDefault,
  type PackingSettings as Settings,
} from '@/shared/packing/rules';
import type { Carton } from '@/shared/packing/geometry';

type CarrierRow = CarrierParcelRule & { key: string };
type GradeRow = GradePackDefault & { grade: string };
interface ConfigView {
  settings: Settings;
  carriers: CarrierRow[];
  grades: GradeRow[];
  fallback: GradePackDefault;
}
type CartonRow = Carton & { active: boolean };

const NEW_CARTON: CartonRow = {
  code: '',
  name: '',
  innerLengthCm: 30,
  innerWidthCm: 20,
  innerHeightCm: 10,
  outerLengthCm: 32,
  outerWidthCm: 22,
  outerHeightCm: 12,
  tareWeightGram: 200,
  costVnd: 0,
  maxLoadGram: 20_000,
  active: true,
};
const CARTON_FIELDS = [
  'innerLengthCm',
  'innerWidthCm',
  'innerHeightCm',
  'outerLengthCm',
  'outerWidthCm',
  'outerHeightCm',
  'tareWeightGram',
  'costVnd',
  'maxLoadGram',
] as const;
const SETTING_FIELDS = [
  'paddingCm',
  'wrapCm',
  'maxStackLoadGram',
  'handlingVndPerParcel',
  'splitPenaltyVnd',
  'maxParcelsPerOrder',
] as const;
const RULE_FIELDS = ['maxWeightGram', 'maxSideCm', 'maxSumCm', 'volumetricDivisor'] as const;
const BOX_FIELDS = ['lengthCm', 'widthCm', 'heightCm', 'weightGram'] as const;

const NumberInput = ({
  value,
  onChange,
  label,
  min = 0,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
}) => (
  <input
    type="number"
    min={min}
    step={1}
    required
    aria-label={label}
    className="packing-number"
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
  />
);

// The package optimizer's settings (docs/business/deposit-delivery-specification.md, "Đóng gói nhiều kiện"): each
// carrier's parcel limits (unverified until staff check them against the contract), cushioning and the cost of an
// extra parcel, the typical box of each kit grade, and the shop's carton catalog.
export default function PackingSettings() {
  const t = useTranslations('packingSettings');
  const [config, setConfig] = useState<ConfigView>();
  const [cartons, setCartons] = useState<CartonRow[]>([]);
  const [draft, setDraft] = useState<CartonRow>(NEW_CARTON);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Api.get('/admin/shipping/packing')
      .then((response) => {
        setConfig(response.data.config);
        setCartons(response.data.cartons);
      })
      .catch(() => undefined);
  }, []);
  if (!config) return null;

  const carrierName = (key: string) => (key === 'default' ? t('otherCarriers') : (SUPERAI_CARRIERS[key] ?? `#${key}`));
  const missingCarriers = Object.keys(SUPERAI_CARRIERS).filter(
    (key) => !config.carriers.some((row) => row.key === key),
  );
  const setCarrier = (key: string, patch: Partial<CarrierRow>) =>
    setConfig({ ...config, carriers: config.carriers.map((row) => (row.key === key ? { ...row, ...patch } : row)) });
  const setGrade = (grade: string, patch: Partial<GradeRow>) =>
    setConfig({ ...config, grades: config.grades.map((row) => (row.grade === grade ? { ...row, ...patch } : row)) });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setConfig((await Api.put('/admin/shipping/packing', config)).data);
      toast.success(t('saved'));
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  const saveCarton = async (row: CartonRow) => {
    setBusy(true);
    try {
      setCartons((await Api.post('/admin/shipping/cartons', row)).data);
      if (row === draft) setDraft(NEW_CARTON);
      toast.success(t('cartonSaved', { code: row.code.toUpperCase() }));
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="mu-panel space-y-6 p-5" onSubmit={(event) => void save(event)}>
        <header>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mu-note">{t('intro')}</p>
        </header>

        <section className="space-y-3">
          <h3 className="font-semibold">{t('carriersTitle')}</h3>
          <div className="overflow-x-auto">
            <table className="packing-table">
              <thead>
                <tr>
                  <th>{t('carrier')}</th>
                  {RULE_FIELDS.map((field) => (
                    <th key={field}>{t(`rule.${field}`)}</th>
                  ))}
                  <th>{t('rule.verified')}</th>
                </tr>
              </thead>
              <tbody>
                {config.carriers.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{carrierName(row.key)}</strong>
                      {!row.verified && <span className="packing-unverified">{t('unverified')}</span>}
                    </td>
                    {RULE_FIELDS.map((field) => (
                      <td key={field}>
                        <NumberInput
                          label={`${carrierName(row.key)} ${t(`rule.${field}`)}`}
                          value={row[field]}
                          min={1}
                          onChange={(value) => setCarrier(row.key, { [field]: value })}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${carrierName(row.key)} ${t('rule.verified')}`}
                        checked={row.verified}
                        onChange={(event) => setCarrier(row.key, { verified: event.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missingCarriers.length > 0 && (
            <label className="mu-field max-w-xs">
              {t('addCarrier')}
              <select
                value=""
                onChange={(event) => {
                  const base = config.carriers.find((row) => row.key === 'default')!;
                  setConfig({
                    ...config,
                    carriers: [...config.carriers, { ...base, key: event.target.value, verified: false }],
                  });
                }}
              >
                <option value="" disabled>
                  {t('chooseCarrier')}
                </option>
                {missingCarriers.map((key) => (
                  <option key={key} value={key}>
                    {SUPERAI_CARRIERS[key]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="mu-note">{t('carriersNote')}</p>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t('settingsTitle')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {SETTING_FIELDS.map((field) => (
              <label key={field} className="mu-field">
                {t(`setting.${field}`)}
                <NumberInput
                  label={t(`setting.${field}`)}
                  value={config.settings[field]}
                  onChange={(value) => setConfig({ ...config, settings: { ...config.settings, [field]: value } })}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t('gradesTitle')}</h3>
          <p className="mu-note">{t('gradesNote')}</p>
          <div className="overflow-x-auto">
            <table className="packing-table">
              <thead>
                <tr>
                  <th>{t('grade')}</th>
                  {BOX_FIELDS.map((field) => (
                    <th key={field}>{t(`box.${field}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...config.grades, { ...config.fallback, grade: '' }].map((row) => (
                  <tr key={row.grade || 'fallback'}>
                    <td>
                      <strong>{row.grade || t('fallback')}</strong>
                    </td>
                    {BOX_FIELDS.map((field) => (
                      <td key={field}>
                        <NumberInput
                          label={`${row.grade || t('fallback')} ${t(`box.${field}`)}`}
                          value={row[field]}
                          min={1}
                          onChange={(value) =>
                            row.grade
                              ? setGrade(row.grade, { [field]: value })
                              : setConfig({ ...config, fallback: { ...config.fallback, [field]: value } })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <button className="mu-button" disabled={busy}>
          {t('save')}
        </button>
      </form>

      <section className="mu-panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">{t('cartonsTitle')}</h2>
        <p className="mu-note">{t('cartonsNote')}</p>
        <div className="overflow-x-auto">
          <table className="packing-table">
            <thead>
              <tr>
                <th>{t('carton.code')}</th>
                <th>{t('carton.name')}</th>
                {CARTON_FIELDS.map((field) => (
                  <th key={field}>{t(`carton.${field}`)}</th>
                ))}
                <th>{t('carton.active')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...cartons, draft].map((row, index) => {
                const isDraft = index === cartons.length;
                const update = (patch: Partial<CartonRow>) =>
                  isDraft
                    ? setDraft({ ...draft, ...patch })
                    : setCartons(cartons.map((item) => (item.code === row.code ? { ...item, ...patch } : item)));
                return (
                  <tr key={isDraft ? 'new' : row.code} className={row.active ? '' : 'is-inactive'}>
                    <td>
                      {isDraft ? (
                        <input
                          aria-label={t('carton.code')}
                          className="packing-text"
                          placeholder="C-XL"
                          value={row.code}
                          onChange={(event) => update({ code: event.target.value })}
                        />
                      ) : (
                        <code>{row.code}</code>
                      )}
                    </td>
                    <td>
                      <input
                        aria-label={t('carton.name')}
                        className="packing-text"
                        value={row.name}
                        onChange={(event) => update({ name: event.target.value })}
                      />
                    </td>
                    {CARTON_FIELDS.map((field) => (
                      <td key={field}>
                        <NumberInput
                          label={`${row.code} ${t(`carton.${field}`)}`}
                          value={row[field]}
                          onChange={(value) => update({ [field]: value })}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${row.code} ${t('carton.active')}`}
                        checked={row.active}
                        onChange={(event) => update({ active: event.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={isDraft ? 'mu-button' : 'mu-button-secondary'}
                        disabled={busy || !row.code || !row.name}
                        onClick={() => void saveCarton(row)}
                      >
                        {t(isDraft ? 'addCarton' : 'saveCarton')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
