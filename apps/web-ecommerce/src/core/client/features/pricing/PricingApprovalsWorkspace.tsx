'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';

type Status = 'DRAFT' | 'APPROVED' | 'RETIRED';
interface PriceRecord {
  id: number;
  version: number;
  listPriceVnd: number;
  proof: string;
  status: Status;
  reason: string;
  proposedByUserId: number;
  createdAt: string;
}
interface CostRecord {
  id: number;
  version: number;
  status: Status;
  reason: string;
  proposedByUserId: number;
  createdAt: string;
  buyInVnd: number;
  repairVnd: number;
  packagingVnd: number;
  handlingVnd: number;
  shippingSubsidyVnd: number;
  fixedFeeVnd: number;
  expectedReturnVnd: number;
}
interface Row {
  id: number;
  sku: string;
  name: string;
  priceVnd: number;
  receiptCostVnd: number;
  unitCostVnd: number;
  priceMismatch: boolean;
  prices: PriceRecord[];
  costs: CostRecord[];
}

const COST_FIELDS = [
  'buyInVnd',
  'repairVnd',
  'packagingVnd',
  'handlingVnd',
  'shippingSubsidyVnd',
  'fixedFeeVnd',
  'expectedReturnVnd',
] as const;

// Approved list prices R and cost profiles (docs/business/pricing-voucher-specification.md, decision V3): one admin
// proposes, a second approves; the voucher guard reads only approved records.
export default function PricingApprovalsWorkspace() {
  const t = useTranslations('pricingApprovals'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<{ id: number; kind: 'price' | 'cost' } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (search: string) => {
    try {
      setRows((await Api.get('/admin/pricing/records', { params: { q: search } })).data);
    } catch {
      /* The toast explains it. */
    }
  }, []);
  useEffect(() => {
    void load('');
  }, [load]);
  const act = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await Api.post(path, body);
      setOpen(null);
      await load(q);
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  const propose = (row: Row, kind: 'price' | 'cost') => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { productId: row.id, reason: form.get('reason') };
    if (kind === 'price') Object.assign(body, { listPriceVnd: row.priceVnd, proof: form.get('proof') });
    else for (const field of COST_FIELDS) body[field] = Number(form.get(field) || 0);
    void act(`/admin/pricing/records/${kind}`, body);
  };
  const actions = (kind: 'price' | 'cost', record: { id: number; status: Status }) =>
    record.status === 'DRAFT' && (
      <span className="ml-2 inline-flex gap-3">
        <button className="underline" disabled={busy} onClick={() => void act(`/admin/pricing/records/${kind}/${record.id}/approve`)}>
          {t('approve')}
        </button>
        <button className="underline" disabled={busy} onClick={() => void act(`/admin/pricing/records/${kind}/${record.id}/retire`)}>
          {t('withdraw')}
        </button>
      </span>
    );
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mu-note max-w-3xl">{t('intro')}</p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load(q);
          }}
        >
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
          <button className="mu-button">{t('find')}</button>
        </form>
      </header>
      {!rows.length && <p className="mu-note">{t('empty')}</p>}
      {rows.map((row) => (
        <article key={row.id} className="mu-panel space-y-3 p-5">
          <h2 className="font-bold">
            {row.name} <span className="mu-note">· {row.sku}</span>
          </h2>
          <p className="text-sm">
            {t('summary', { price: money(row.priceVnd), receipt: money(row.receiptCostVnd), cost: money(row.unitCostVnd) })}
          </p>
          {row.priceMismatch && <p className="text-sm font-semibold text-red-700">{t('mismatch')}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold">{t('prices')}</h3>
              {row.prices.length ? (
                <ul>
                  {row.prices.map((record) => (
                    <li key={record.id}>
                      {t('priceRecord', { version: record.version, price: money(record.listPriceVnd), status: t(`status.${record.status}`) })}
                      <span className="mu-note"> · {record.proof}</span>
                      {actions('price', record)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mu-note">{t('none')}</p>
              )}
              {open?.id === row.id && open.kind === 'price' ? (
                <form className="space-y-2" onSubmit={propose(row, 'price')}>
                  <label className="mu-field">
                    {t('proof')}
                    <input name="proof" required maxLength={1000} />
                  </label>
                  <label className="mu-field">
                    {t('reason')}
                    <input name="reason" required maxLength={1000} />
                  </label>
                  <button className="mu-button" disabled={busy}>
                    {t('proposePrice', { price: money(row.priceVnd) })}
                  </button>
                </form>
              ) : (
                <button className="underline" onClick={() => setOpen({ id: row.id, kind: 'price' })}>
                  {t('proposePrice', { price: money(row.priceVnd) })}
                </button>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold">{t('costs')}</h3>
              {row.costs.length ? (
                <ul>
                  {row.costs.map((record) => (
                    <li key={record.id}>
                      {t('costRecord', {
                        version: record.version,
                        total: money(COST_FIELDS.reduce((sum, field) => sum + record[field], 0)),
                        status: t(`status.${record.status}`),
                      })}
                      {actions('cost', record)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mu-note">{t('none')}</p>
              )}
              {open?.id === row.id && open.kind === 'cost' ? (
                <form className="grid gap-2 sm:grid-cols-2" onSubmit={propose(row, 'cost')}>
                  {COST_FIELDS.map((field) => (
                    <label key={field} className="mu-field">
                      {t(`fields.${field}`)}
                      <input
                        name={field}
                        type="number"
                        min={field === 'buyInVnd' ? 1 : 0}
                        step={1}
                        defaultValue={field === 'buyInVnd' ? row.receiptCostVnd || undefined : 0}
                        required={field === 'buyInVnd'}
                      />
                    </label>
                  ))}
                  <label className="mu-field sm:col-span-2">
                    {t('reason')}
                    <input name="reason" required maxLength={1000} />
                  </label>
                  <button className="mu-button sm:col-span-2" disabled={busy}>
                    {t('proposeCost')}
                  </button>
                </form>
              ) : (
                <button className="underline" onClick={() => setOpen({ id: row.id, kind: 'cost' })}>
                  {t('proposeCost')}
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
