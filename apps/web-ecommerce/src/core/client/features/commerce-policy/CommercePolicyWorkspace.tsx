'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { inputClassName } from '@/components/FormElements/TextField';
import { formatVND } from '@/shared/server/utils/utils';
import { DEFAULT_VOUCHER_POLICY } from '@/shared/voucher-stack';
import '@/core/client/features/pricing/pricing-admin.css';

interface Policy {
  id: number;
  name: string;
  version: number;
  settings: Record<string, string | number>;
  reason: string;
  createdAt: string;
}
type Field = { key: string; options?: string[]; number?: boolean; min?: number; max?: number };
const POLICY_NAMES = ['loyalty', 'voucher', 'reservation', 'pawn', 'marketplace', 'buyback'] as const;
const CHOICES: Record<string, Field[]> = {
  reservation: [
    { key: 'priceBasis', options: ['net_merchandise'] },
    { key: 'dayCutoff', options: ['elapsed_24h'] },
    { key: 'extensionMode', options: ['additive'] },
  ],
  loyalty: [
    { key: 'rewardTable', options: ['source_shared_v1'] },
    { key: 'stacking', options: ['v6.2', 'marketplace_v1', 'one_primary'] },
    { key: 'refundRounding', options: ['cumulative_net'] },
    { key: 'lifetimeRefund', options: ['reverse_earned'] },
    { key: 'voucherExpiryDays', number: true, min: 1 },
    { key: 'returnControlDays', number: true, min: 0, max: 30 },
  ],
  pawn: [
    { key: 'dailyRateBasisPoints', options: ['3', '30'] },
    { key: 'dayCount', options: ['started_days', 'completed_days'] },
    { key: 'rounding', options: ['ceil', 'floor', 'nearest'] },
    { key: 'graceDays', number: true },
    { key: 'interestStopEvent', options: ['verified_repayment', 'asset_handback'] },
  ],
  marketplace: [
    { key: 'commissionBasisPoints', options: ['500', '600', '700', '800', '1000', '1200'] },
    { key: 'guaranteeBasisPoints', options: ['1000'] },
    { key: 'guaranteeRounding', options: ['ceil', 'floor', 'nearest'] },
    { key: 'settlementDelayDays', number: true },
    { key: 'shippingAllocation', options: ['per_seller_quote'] },
  ],
  buyback: [{ key: 'inboundCod', options: ['not_supported'] }],
  // Only as strict as the owner rules v6.2 or stricter (src/shared/voucher-stack.ts parseVoucherPolicy).
  voucher: [
    { key: 'keepPlainBps', number: true, min: 8000, max: 10000 },
    { key: 'keepStackBps', number: true, min: 7500, max: 10000 },
    { key: 'minimumProfitVnd', number: true, min: 50000, max: 10000000 },
    { key: 'minimumMarginBps', number: true, min: 500, max: 5000 },
    { key: 'feeBps', number: true, min: 0, max: 2000 },
    { key: 'pointReserveVnd', number: true, min: 1120, max: 10000 },
    { key: 'pricingApproval', options: ['recorded', 'required'] },
  ],
};
// Policies whose numbers start from the owner's v6.2 values when nothing is approved yet.
const STARTING_VALUES: Record<string, Record<string, string | number>> = {
  voucher: DEFAULT_VOUCHER_POLICY as unknown as Record<string, string | number>,
};

// Message keys cannot contain dots (next-intl nesting): 'v6.2' is looked up as 'v6_2'.
const valueKey = (value: string | number) => String(value).replace(/\./g, '_');

// Approved business policies: every domain with its approved version at a glance, the selected one's terms as a compact
// form (pre-filled with the version in force), and its retained history. Each approval is a new version with who and
// why; nothing already contracted changes.
export default function CommercePolicyWorkspace() {
  const t = useTranslations('policy'),
    locale = useLocale();
  const [rows, setRows] = useState<Policy[]>([]);
  const [name, setName] = useState<string>('loyalty');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const load = useCallback(async () => {
    try {
      setRows((await Api.get('/admin/commerce/policies')).data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const latest = (policy: string) => rows.find((row) => row.name === policy);
  const current = latest(name);
  const history = rows.filter((row) => row.name === name);
  const display = (key: string, value: string | number) =>
    key.endsWith('BasisPoints') || key.endsWith('Bps')
      ? `${Number(value) / 100}%`
      : key.endsWith('Vnd')
        ? formatVND(Number(value), locale)
        : typeof value === 'number'
          ? value
          : t(`values.${valueKey(value)}`);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const settings = Object.fromEntries(
      CHOICES[name].map((field) => {
        const value = data.get(field.key);
        return [field.key, field.number || field.key.endsWith('BasisPoints') ? Number(value) : value];
      }),
    );
    setBusy(true);
    try {
      await Api.post(`/admin/commerce/policies/${name}/approve`, {
        settings,
        version: current?.version || 0,
        reason: data.get('reason'),
        confirmApproval: data.get('confirmApproval') === 'on',
      });
      await load();
      form.reset();
    } catch {
      /* The shared API reports validation and concurrent approvals. */
    } finally {
      setBusy(false);
    }
  };
  const initial = current?.settings ?? STARTING_VALUES[name] ?? {};

  return (
    <section className="pa-page">
      <header className="pa-head">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
      </header>
      {failed ? (
        <button className="pa-btn" onClick={() => void load()}>
          {t('retry')}
        </button>
      ) : (
        <>
          <div className="pa-stats" role="tablist" aria-label={t('domain')}>
            {POLICY_NAMES.map((policy) => {
              const row = latest(policy);
              return (
                <button
                  key={policy}
                  type="button"
                  role="tab"
                  aria-selected={name === policy}
                  className={`pa-stat${name === policy ? ' is-active' : ''}`}
                  onClick={() => {
                    setName(policy);
                    setShowHistory(false);
                  }}
                >
                  <span>{t(`names.${policy}`)}</span>
                  {row ? (
                    <span className="pa-chip is-success justify-self-start">
                      {t('versionShort', { version: row.version })}
                    </span>
                  ) : STARTING_VALUES[policy] ? (
                    <span className="pa-chip is-info justify-self-start">{t('defaultRules')}</span>
                  ) : (
                    <span className="pa-chip is-warning justify-self-start">{t('notApproved')}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <form
              key={`${name}-${current?.version ?? 0}`}
              onSubmit={(event) => void submit(event)}
              className="admin-table space-y-4 !p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold">{t(`names.${name}`)}</h2>
                <span className="text-xs text-[var(--admin-muted)]">
                  {current
                    ? t('inForce', {
                        version: current.version,
                        date: new Date(current.createdAt).toLocaleDateString(locale),
                      })
                    : t(STARTING_VALUES[name] ? 'defaultRules' : 'notApproved')}
                </span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-[var(--admin-muted)]">{t(`disclosures.${name}`)}</p>
              <div className="pa-form">
                {CHOICES[name].map((field) => (
                  <label key={field.key}>
                    {t(`fields.${field.key}`)}
                    {field.options ? (
                      <select
                        className={inputClassName}
                        name={field.key}
                        required
                        defaultValue={initial[field.key] !== undefined ? String(initial[field.key]) : ''}
                      >
                        <option value="" disabled>
                          {t('choose')}
                        </option>
                        {field.options.map((value) => (
                          <option key={value} value={value}>
                            {field.key.endsWith('BasisPoints')
                              ? `${Number(value) / 100}%`
                              : t(`values.${valueKey(value)}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClassName}
                        name={field.key}
                        type="number"
                        min={field.min ?? 0}
                        max={field.max}
                        step="1"
                        required
                        defaultValue={initial[field.key] !== undefined ? Number(initial[field.key]) : undefined}
                      />
                    )}
                    {(field.min !== undefined || field.max !== undefined) && (
                      <small>
                        {t('range', {
                          min: display(field.key, field.min ?? 0),
                          max: field.max !== undefined ? display(field.key, field.max) : '∞',
                        })}
                      </small>
                    )}
                  </label>
                ))}
                <label className="is-wide">
                  {t('reason')}
                  <textarea className={inputClassName} name="reason" required maxLength={1000} rows={2} />
                </label>
                <label className="is-wide !flex !flex-row items-start gap-2 !font-medium">
                  <input type="checkbox" name="confirmApproval" required className="mt-1" />
                  {t('confirmation')}
                </label>
              </div>
              <button className="pa-btn is-primary" disabled={busy}>
                {t('approve')}
              </button>
            </form>
            <aside className="admin-table space-y-3 !p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">{t('history')}</h2>
                {history.length > 1 && (
                  <button type="button" className="pa-btn" onClick={() => setShowHistory((value) => !value)}>
                    {t(showHistory ? 'hideOlder' : 'showOlder', { count: history.length - 1 })}
                  </button>
                )}
              </div>
              {!history.length && (
                <p className="text-sm text-[var(--admin-muted)]">
                  {t(STARTING_VALUES[name] ? 'voucherDefault' : 'inactive')}
                </p>
              )}
              <ul className="pa-history">
                {(showHistory ? history : history.slice(0, 1)).map((row) => (
                  <li key={row.id} className="!block">
                    <div className="flex items-center justify-between gap-2">
                      <b>{t('version', { version: row.version })}</b>
                      <small className="text-[var(--admin-muted)]">
                        {new Date(row.createdAt).toLocaleString(locale)}
                      </small>
                    </div>
                    <dl className="mt-2 grid gap-1">
                      {Object.entries(row.settings).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-3">
                          <dt className="text-[var(--admin-muted)]">{t(`fields.${key}`)}</dt>
                          <dd className="text-right font-semibold">{display(key, value)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-2 text-[var(--admin-muted)]">{row.reason}</p>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
