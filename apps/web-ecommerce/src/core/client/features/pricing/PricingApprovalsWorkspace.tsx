'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import DataTable, { type DataTableColumn } from '@/components/Tables/DataTable';
import Modal from '@/components/Modal/Modal';
import { inputClassName } from '@/components/FormElements/TextField';
import { formatVND } from '@/shared/server/utils/utils';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import './pricing-admin.css';

type Status = 'DRAFT' | 'APPROVED' | 'RETIRED';
type Filter = 'all' | 'pending' | 'mismatch' | 'unapproved';
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
interface Listing {
  summary: { products: number; pending: number; mismatch: number; approved: number };
  count: number;
  rows: Row[];
}

const PER_PAGE = 30;
const COST_FIELDS = [
  'buyInVnd',
  'repairVnd',
  'packagingVnd',
  'handlingVnd',
  'shippingSubsidyVnd',
  'fixedFeeVnd',
  'expectedReturnVnd',
] as const;
const costTotal = (record: CostRecord) => COST_FIELDS.reduce((sum, field) => sum + record[field], 0);

// Approved list prices R and cost profiles (docs/business/pricing-voucher-specification.md, decision V3). One table to
// scan: what each product's vouchers are checked with, and what waits for a second admin; one side panel per product
// to propose, approve or withdraw.
export default function PricingApprovalsWorkspace() {
  const t = useTranslations('pricingApprovals'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [listing, setListing] = useState<Listing>();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListing(
        (
          await Api.get('/admin/pricing/records', {
            params: { q: search, filter, limit: PER_PAGE, offset: (page - 1) * PER_PAGE },
          })
        ).data,
      );
    } catch {
      /* The toast explains it. */
    } finally {
      setLoading(false);
    }
  }, [search, filter, page]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const open = useMemo(() => listing?.rows.find((row) => row.id === openId) ?? null, [listing, openId]);
  const act = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await Api.post(path, body);
      await load();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const priceChip = (row: Row) => {
    const approved = row.prices.find((record) => record.status === 'APPROVED');
    if (row.priceMismatch) return <span className="pa-chip is-danger">{t('chips.mismatch')}</span>;
    if (approved)
      return <span className="pa-chip is-success">{t('chips.approved', { version: approved.version })}</span>;
    return <span className="pa-chip">{t('chips.none')}</span>;
  };
  const costChip = (row: Row) => {
    const approved = row.costs.find((record) => record.status === 'APPROVED');
    return approved ? (
      <span className="pa-chip is-success">{t('chips.approved', { version: approved.version })}</span>
    ) : (
      <span className="pa-chip">{t('chips.receipt')}</span>
    );
  };
  const drafts = (row: Row) =>
    row.prices.filter((record) => record.status === 'DRAFT').length +
    row.costs.filter((record) => record.status === 'DRAFT').length;

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'name',
      header: t('columns.product'),
      className: 'min-w-[240px]',
      render: (row) => (
        <span className="pa-cell">
          <strong className="truncate">{row.name}</strong>
          <small>{row.sku}</small>
        </span>
      ),
    },
    {
      key: 'price',
      header: t('columns.price'),
      render: (row) => <span className="pa-money">{money(row.priceVnd)}</span>,
    },
    {
      key: 'cost',
      header: t('columns.cost'),
      render: (row) => (
        <span className="pa-cell">
          <span className="pa-money">{money(row.unitCostVnd)}</span>
          {row.unitCostVnd !== row.receiptCostVnd && (
            <small>{t('receipt', { amount: money(row.receiptCostVnd) })}</small>
          )}
        </span>
      ),
    },
    { key: 'priceState', header: t('columns.listPrice'), render: priceChip },
    { key: 'costState', header: t('columns.costProfile'), render: costChip },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="pa-actions">
          {drafts(row) > 0 && <span className="pa-chip is-warning">{t('chips.pending', { count: drafts(row) })}</span>}
          <button type="button" className="pa-btn" onClick={() => setOpenId(row.id)}>
            {t('manage')}
          </button>
        </div>
      ),
    },
  ];

  const summary = listing?.summary;
  const filters: { key: Filter; label: string; count?: number; tone?: string }[] = [
    { key: 'all', label: t('filters.all'), count: summary?.products },
    { key: 'pending', label: t('filters.pending'), count: summary?.pending, tone: 'is-warning' },
    { key: 'mismatch', label: t('filters.mismatch'), count: summary?.mismatch, tone: 'is-danger' },
    {
      key: 'unapproved',
      label: t('filters.unapproved'),
      count: summary ? summary.products - summary.approved : undefined,
    },
  ];

  return (
    <section className="pa-page">
      <header className="pa-head">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
      </header>
      <div className="pa-stats" role="group" aria-label={t('filterLabel')}>
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            className={`pa-stat ${item.tone ?? ''}${filter === item.key ? ' is-active' : ''}`}
            onClick={() => {
              setFilter(item.key);
              setPage(1);
            }}
          >
            <span>{item.label}</span>
            <strong>{item.count ?? '—'}</strong>
          </button>
        ))}
      </div>
      <DataTable
        title={t('tableTitle')}
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-56`}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
            />
          </>
        }
        columns={columns}
        data={listing?.rows ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        emptyText={t('empty')}
        onRowClick={(row) => setOpenId(row.id)}
        pagination={
          listing
            ? {
                total: listing.count,
                page,
                perPage: PER_PAGE,
                totalPages: Math.max(1, Math.ceil(listing.count / PER_PAGE)),
                hasNextPage: page * PER_PAGE < listing.count,
                hasPreviousPage: page > 1,
              }
            : undefined
        }
        onPageChange={setPage}
      />
      <Modal open={!!open} title={open?.name ?? ''} onClose={() => setOpenId(null)} size="lg">
        {open && <ProductRecords row={open} busy={busy} money={money} onAct={act} />}
      </Modal>
    </section>
  );
}

function ProductRecords({
  row,
  busy,
  money,
  onAct,
}: {
  row: Row;
  busy: boolean;
  money: (amount: number) => string;
  onAct: (path: string, body?: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useTranslations('pricingApprovals'),
    locale = useLocale();
  const [tab, setTab] = useState<'price' | 'cost'>('price');
  const [cost, setCost] = useState<Record<(typeof COST_FIELDS)[number], number>>(() => ({
    buyInVnd: row.receiptCostVnd || 0,
    repairVnd: 0,
    packagingVnd: 0,
    handlingVnd: 0,
    shippingSubsidyVnd: 0,
    fixedFeeVnd: 0,
    expectedReturnVnd: 0,
  }));
  const date = (value: string) => new Date(value).toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN');
  const status = (value: Status) => (
    <span className={`pa-chip ${value === 'APPROVED' ? 'is-success' : value === 'DRAFT' ? 'is-warning' : ''}`}>
      {t(`status.${value}`)}
    </span>
  );
  const { user } = useCurrentUser();
  // The proposer cannot approve their own draft (the server refuses it too): say so instead of offering the button.
  const draftActions = (kind: 'price' | 'cost', id: number, proposer: number) => (
    <span className="pa-actions">
      <button
        type="button"
        className="pa-btn is-primary"
        disabled={busy || proposer === user?.id}
        title={proposer === user?.id ? t('ownProposal') : undefined}
        onClick={() => void onAct(`/admin/pricing/records/${kind}/${id}/approve`)}
      >
        {t('approve')}
      </button>
      <button
        type="button"
        className="pa-btn"
        disabled={busy}
        onClick={() => void onAct(`/admin/pricing/records/${kind}/${id}/retire`)}
      >
        {t('withdraw')}
      </button>
    </span>
  );
  const submit = (kind: 'price' | 'cost') => async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const body: Record<string, unknown> = { productId: row.id, reason: data.get('reason') };
    if (kind === 'price') Object.assign(body, { listPriceVnd: row.priceVnd, proof: data.get('proof') });
    else Object.assign(body, cost);
    if (await onAct(`/admin/pricing/records/${kind}`, body)) form.reset();
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        {row.sku} ·{' '}
        {t('summary', { price: money(row.priceVnd), receipt: money(row.receiptCostVnd), cost: money(row.unitCostVnd) })}
      </p>
      {row.priceMismatch && <p className="pa-chip is-danger !whitespace-normal !rounded-lg !p-3">{t('mismatch')}</p>}
      <div className="pa-segment" role="tablist">
        {(['price', 'cost'] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-pressed={tab === value} onClick={() => setTab(value)}>
            {t(value === 'price' ? 'prices' : 'costs')}
          </button>
        ))}
      </div>
      {tab === 'price' ? (
        <>
          <ul className="pa-history">
            {row.prices.length === 0 && <li className="mu-note">{t('none')}</li>}
            {row.prices.map((record) => (
              <li key={record.id}>
                <span>
                  <b>v{record.version}</b> · <span className="pa-money">{money(record.listPriceVnd)}</span> ·{' '}
                  {date(record.createdAt)}
                  <br />
                  <small className="mu-note">{record.proof}</small>
                </span>
                {status(record.status)}
                {record.status === 'DRAFT' && draftActions('price', record.id, record.proposedByUserId)}
              </li>
            ))}
          </ul>
          <form className="pa-form" onSubmit={(event) => void submit('price')(event)}>
            <label className="is-wide">
              {t('proof')}
              <input className={inputClassName} name="proof" required maxLength={1000} />
            </label>
            <label className="is-wide">
              {t('reason')}
              <input className={inputClassName} name="reason" required maxLength={1000} />
            </label>
            <button className="pa-btn is-primary is-wide justify-self-start" disabled={busy}>
              {t('proposePrice', { price: money(row.priceVnd) })}
            </button>
          </form>
        </>
      ) : (
        <>
          <ul className="pa-history">
            {row.costs.length === 0 && <li className="mu-note">{t('none')}</li>}
            {row.costs.map((record) => (
              <li key={record.id}>
                <span>
                  <b>v{record.version}</b> · <span className="pa-money">{money(costTotal(record))}</span> ·{' '}
                  {date(record.createdAt)}
                  <br />
                  <small className="mu-note">{record.reason}</small>
                </span>
                {status(record.status)}
                {record.status === 'DRAFT' && draftActions('cost', record.id, record.proposedByUserId)}
              </li>
            ))}
          </ul>
          <form className="pa-form" onSubmit={(event) => void submit('cost')(event)}>
            {COST_FIELDS.map((field) => (
              <label key={field}>
                {t(`fields.${field}`)}
                <input
                  className={inputClassName}
                  type="number"
                  min={field === 'buyInVnd' ? 1 : 0}
                  step={1}
                  required={field === 'buyInVnd'}
                  value={cost[field]}
                  onChange={(event) => setCost((current) => ({ ...current, [field]: Number(event.target.value) || 0 }))}
                />
              </label>
            ))}
            <div className="pa-total is-wide">
              <span>{t('unitTotal')}</span>
              <span className="pa-money">{money(Object.values(cost).reduce((sum, value) => sum + value, 0))}</span>
            </div>
            <label className="is-wide">
              {t('reason')}
              <input className={inputClassName} name="reason" required maxLength={1000} />
            </label>
            <button className="pa-btn is-primary is-wide justify-self-start" disabled={busy}>
              {t('proposeCost')}
            </button>
          </form>
        </>
      )}
      <p className="mu-note">{t('secondAdmin')}</p>
    </div>
  );
}
